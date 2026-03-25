const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;
const enableDemoData = process.env.ENABLE_DEMO_DATA === "true";
const trustProxy = ["1", "true", "yes"].includes(String(process.env.TRUST_PROXY || "").toLowerCase());
const sessionCookieName = String(process.env.SESSION_COOKIE_NAME || "berichtsheft.sid").trim() || "berichtsheft.sid";
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET muss in Produktion gesetzt sein.");
}

if (isProduction && enableDemoData) {
  throw new Error("ENABLE_DEMO_DATA darf in Produktion nicht aktiviert sein.");
}

if (trustProxy) {
  app.set("trust proxy", 1);
}

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const dbFile = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(dataDir, "berichtsheft.db");
const legacyFile = process.env.LEGACY_FILE ? path.resolve(process.env.LEGACY_FILE) : path.join(dataDir, "berichtsheft.json");

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

ensureStorage();

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEntry(input) {
  const dateFrom = String(input.dateFrom || "").trim();
  return {
    id: String(input.id || `entry-${Date.now()}-${Math.random()}`),
    weekLabel: String(input.weekLabel || "").trim(),
    dateFrom,
    dateTo: String(input.dateTo || dateFrom).trim(),
    betrieb: String(input.betrieb || "").trim(),
    schule: String(input.schule || "").trim(),
    status: String(input.status || "draft"),
    signedAt: input.status === "signed" ? input.signedAt || new Date().toISOString() : input.signedAt || null,
    signerName: String(input.signerName || "").trim(),
    trainerComment: String(input.trainerComment || "").trim(),
    rejectionReason: String(input.rejectionReason || "").trim()
  };
}

function normalizeThemePreference(input) {
  const value = String(input || "").trim().toLowerCase();
  return ["light", "dark", "system"].includes(value) ? value : "system";
}

function toIsoDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseImportedDate(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return toIsoDateParts(parsed.y, parsed.m, parsed.d);
    }
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const dotted = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dotted) {
    return toIsoDateParts(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]));
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return "";
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('trainee', 'trainer', 'admin')),
      ausbildung TEXT NOT NULL DEFAULT '',
      betrieb TEXT NOT NULL DEFAULT '',
      berufsschule TEXT NOT NULL DEFAULT '',
      trainer_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(trainer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS educations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS trainee_trainers (
      trainee_id INTEGER NOT NULL,
      trainer_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (trainee_id, trainer_id),
      FOREIGN KEY(trainee_id) REFERENCES users(id),
      FOREIGN KEY(trainer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      trainee_id INTEGER NOT NULL,
      weekLabel TEXT NOT NULL DEFAULT '',
      dateFrom TEXT NOT NULL DEFAULT '',
      dateTo TEXT NOT NULL DEFAULT '',
      betrieb TEXT NOT NULL DEFAULT '',
      schule TEXT NOT NULL DEFAULT '',
      themen TEXT NOT NULL DEFAULT '',
      reflection TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'signed', 'rejected')),
      signedAt TEXT,
      signerName TEXT NOT NULL DEFAULT '',
      trainerComment TEXT NOT NULL DEFAULT '',
      rejectionReason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(trainee_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trainee_id INTEGER NOT NULL,
      fach TEXT NOT NULL DEFAULT '',
      typ TEXT NOT NULL CHECK(typ IN ('Schulaufgabe', 'Stegreifaufgabe')),
      bezeichnung TEXT NOT NULL DEFAULT '',
      datum TEXT NOT NULL DEFAULT '',
      note REAL NOT NULL,
      gewicht INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(trainee_id) REFERENCES users(id)
    );
  `);
}

function tableHasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function migrateUserSchema() {
  const usersTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!usersTable) {
    return;
  }

  if (!tableHasColumn("users", "username")) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT");
  }

  const rows = db.prepare("SELECT id, email, username FROM users ORDER BY id ASC").all();
  const used = new Set();
  const updateUser = db.prepare("UPDATE users SET username = ? WHERE id = ?");

  for (const row of rows) {
    const baseUsername =
      normalizeUsername(row.username) ||
      normalizeUsername(String(row.email || "").split("@")[0]) ||
      `user-${row.id}`;
    let nextUsername = baseUsername;
    let counter = 2;

    while (used.has(nextUsername)) {
      nextUsername = `${baseUsername}-${counter}`;
      counter += 1;
    }

    used.add(nextUsername);
    updateUser.run(nextUsername, row.id);
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)");

  if (!tableHasColumn("users", "theme_preference")) {
    db.exec("ALTER TABLE users ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'system'");
  }

  db.prepare(`
    UPDATE users
    SET theme_preference = 'system'
    WHERE theme_preference NOT IN ('light', 'dark', 'system') OR theme_preference IS NULL OR TRIM(theme_preference) = ''
  `).run();

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_educations_name ON educations (name)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_trainee_trainers_pair ON trainee_trainers (trainee_id, trainer_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_trainee_trainers_trainer ON trainee_trainers (trainer_id)");
}

function syncEducationsFromUsers() {
  const educationRows = db.prepare(`
    SELECT DISTINCT TRIM(ausbildung) AS name
    FROM users
    WHERE TRIM(ausbildung) != ''
  `).all();
  const insertEducation = db.prepare("INSERT OR IGNORE INTO educations (name) VALUES (?)");

  for (const row of educationRows) {
    insertEducation.run(row.name);
  }
}

function migrateTrainerAssignments() {
  const legacyAssignments = db.prepare(`
    SELECT id AS trainee_id, trainer_id
    FROM users
    WHERE role = 'trainee' AND trainer_id IS NOT NULL
  `).all();
  const insertAssignment = db.prepare("INSERT OR IGNORE INTO trainee_trainers (trainee_id, trainer_id) VALUES (?, ?)");

  for (const assignment of legacyAssignments) {
    insertAssignment.run(assignment.trainee_id, assignment.trainer_id);
  }

  db.prepare(`
    DELETE FROM trainee_trainers
    WHERE trainee_id IN (SELECT id FROM users WHERE role != 'trainee')
       OR trainer_id IN (SELECT id FROM users WHERE role != 'trainer')
  `).run();
}

function migrateEntrySchema() {
  const entriesTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entries'").get();
  if (!entriesTable) {
    return;
  }

  const addColumn = (name, definition) => {
    if (!tableHasColumn("entries", name)) {
      db.exec(`ALTER TABLE entries ADD COLUMN ${name} ${definition}`);
    }
  };

  addColumn("trainee_id", "INTEGER");
  addColumn("status", "TEXT NOT NULL DEFAULT 'draft'");
  addColumn("signerName", "TEXT NOT NULL DEFAULT ''");
  addColumn("trainerComment", "TEXT NOT NULL DEFAULT ''");
  addColumn("rejectionReason", "TEXT NOT NULL DEFAULT ''");
  addColumn("created_at", "TEXT");
  addColumn("updated_at", "TEXT");

  db.prepare("UPDATE entries SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)").run();
  db.prepare("UPDATE entries SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)").run();

  const duplicateDates = db.prepare(`
    SELECT trainee_id, dateFrom, COUNT(*) AS count
    FROM entries
    WHERE dateFrom != ''
    GROUP BY trainee_id, dateFrom
    HAVING COUNT(*) > 1
  `).all();

  if (!duplicateDates.length) {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_trainee_date ON entries (trainee_id, dateFrom)");
  }
}

function ensureDemoUsers() {
  if (!enableDemoData) {
    return;
  }
  const hasUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0;
  if (hasUsers) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role, ausbildung, betrieb, berufsschule, trainer_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const trainer = insert.run(
    "Herr Ausbilder",
    "trainer",
    "trainer@example.com",
    hashPassword("trainer123"),
    "trainer",
    "",
    "Muster GmbH",
    "",
    null
  );

  insert.run(
    "Max Mustermann",
    "azubi",
    "azubi@example.com",
    hashPassword("azubi123"),
    "trainee",
    "Fachinformatiker",
    "Muster GmbH",
    "BBS",
    trainer.lastInsertRowid
  );

  insert.run(
    "Admin",
    "admin",
    "admin@example.com",
    hashPassword("admin123"),
    "admin",
    "",
    "Muster GmbH",
    "",
    null
  );
}

function migrateLegacyJson() {
  if (!fs.existsSync(legacyFile)) {
    return;
  }

  const hasEntries = db.prepare("SELECT COUNT(*) AS count FROM entries").get().count > 0;
  if (hasEntries) {
    return;
  }

  let json;
  try {
    json = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
  } catch (error) {
    return;
  }

  const trainee = db.prepare("SELECT * FROM users WHERE role = 'trainee' ORDER BY id ASC LIMIT 1").get();
  if (!trainee) {
    return;
  }

  db.prepare(`
    UPDATE users
    SET name = ?, ausbildung = ?, betrieb = ?, berufsschule = ?
    WHERE id = ?
  `).run(
    String(json.trainee?.name || trainee.name).trim(),
    String(json.trainee?.ausbildung || trainee.ausbildung).trim(),
    String(json.trainee?.betrieb || trainee.betrieb).trim(),
    String(json.trainee?.berufsschule || trainee.berufsschule).trim(),
    trainee.id
  );

  const insertEntry = db.prepare(`
    INSERT INTO entries (
      id, trainee_id, weekLabel, dateFrom, dateTo, betrieb, schule, themen, reflection,
      status, signedAt, signerName, trainerComment, rejectionReason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const rawEntry of Array.isArray(json.entries) ? json.entries : []) {
    const entry = normalizeEntry(rawEntry);
    insertEntry.run(
      entry.id,
      trainee.id,
      entry.weekLabel,
      entry.dateFrom,
      entry.dateTo,
      entry.betrieb,
      entry.schule,
      "",
      "",
      rawEntry.signature ? "signed" : "draft",
      entry.signedAt,
      entry.signerName,
      "",
      entry.rejectionReason
    );
  }
}

function ensureDemoData() {
  if (!enableDemoData) {
    return;
  }
  const trainee = db.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").get("azubi@example.com");
  if (!trainee) {
    return;
  }

  const insertEntry = db.prepare(`
    INSERT INTO entries (
      id, trainee_id, weekLabel, dateFrom, dateTo, betrieb, schule, themen, reflection,
      status, signedAt, signerName, trainerComment, rejectionReason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const demoEntries = [
      {
        id: "demo-entry-2026-03-16",
        weekLabel: "Einrichtung Arbeitsplatz",
        dateFrom: "2026-03-16",
        betrieb: "Notebook eingerichtet, Benutzerkonto angelegt und interne Tools installiert.",
        schule: "",
        status: "signed",
        signedAt: "2026-03-17T08:15:00.000Z",
        signerName: "Herr Ausbilder",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "demo-entry-2026-03-17",
        weekLabel: "Einweisung Ticketsystem",
        dateFrom: "2026-03-17",
        betrieb: "Erste Supportfaelle im Ticketsystem analysiert und dokumentiert.",
        schule: "",
        status: "signed",
        signedAt: "2026-03-18T08:10:00.000Z",
        signerName: "Herr Ausbilder",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "demo-entry-2026-03-18",
        weekLabel: "Netzwerkgrundlagen",
        dateFrom: "2026-03-18",
        betrieb: "",
        schule: "OSI-Modell, IPv4-Adressierung und Subnetting in der Berufsschule behandelt.",
        status: "signed",
        signedAt: "2026-03-19T08:05:00.000Z",
        signerName: "Herr Ausbilder",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "demo-entry-2026-03-19",
        weekLabel: "Dokumentation Wissensbasis",
        dateFrom: "2026-03-19",
        betrieb: "Interne Wissensartikel zu Standardstoerungen ueberarbeitet.",
        schule: "",
        status: "submitted",
        signedAt: null,
        signerName: "",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "demo-entry-2026-03-20",
        weekLabel: "Benutzerverwaltung AD",
        dateFrom: "2026-03-20",
        betrieb: "Benutzer in der Testumgebung angelegt und Gruppenrechte nachvollzogen.",
        schule: "",
        status: "draft",
        signedAt: null,
        signerName: "",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "demo-entry-2026-03-23",
        weekLabel: "Grundlagen SQL",
        dateFrom: "2026-03-23",
        betrieb: "",
        schule: "SELECT, WHERE, ORDER BY und erste JOINs im Unterricht geuebt.",
        status: "signed",
        signedAt: "2026-03-24T08:20:00.000Z",
        signerName: "Herr Ausbilder",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "demo-entry-2026-03-24",
        weekLabel: "Inventarisierung Hardware",
        dateFrom: "2026-03-24",
        betrieb: "Neue Geraete in die Inventarliste aufgenommen und Seriennummern geprueft.",
        schule: "",
        status: "signed",
        signedAt: "2026-03-25T08:10:00.000Z",
        signerName: "Herr Ausbilder",
        trainerComment: "",
        rejectionReason: ""
      },
      {
        id: "demo-entry-2026-03-25",
        weekLabel: "Rueckfrage zum Bericht",
        dateFrom: "2026-03-25",
        betrieb: "Vorgangsbeschreibung war zu kurz und wurde vom Ausbilder zur Korrektur markiert.",
        schule: "",
        status: "rejected",
        signedAt: null,
        signerName: "",
        trainerComment: "Bitte den Arbeitsablauf genauer beschreiben.",
        rejectionReason: "Bitte den Arbeitsablauf genauer beschreiben."
      }
    ];

  demoEntries.forEach((entry) => {
      const exists = db.prepare("SELECT 1 FROM entries WHERE trainee_id = ? AND (id = ? OR dateFrom = ?)").get(trainee.id, entry.id, entry.dateFrom);
      if (exists) {
        return;
      }

      insertEntry.run(
        entry.id,
        trainee.id,
        entry.weekLabel,
        entry.dateFrom,
        entry.dateFrom,
        entry.betrieb,
        entry.schule,
        entry.status,
        entry.signedAt,
        entry.signerName,
        entry.trainerComment,
        entry.rejectionReason
      );
    });

  const insertGrade = db.prepare(`
    INSERT INTO grades (trainee_id, fach, typ, bezeichnung, datum, note, gewicht)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  [
      ["Programmierung", "Schulaufgabe", "Java Grundlagen", "2026-02-10", 2, 2],
      ["Programmierung", "Stegreifaufgabe", "Klassen und Objekte", "2026-02-18", 1, 1],
      ["Netzwerktechnik", "Schulaufgabe", "IPv4 und Subnetting", "2026-03-02", 3, 2],
      ["BWL", "Stegreifaufgabe", "Unternehmensformen", "2026-03-09", 2, 1],
      ["Deutsch", "Stegreifaufgabe", "Protokoll schreiben", "2026-03-12", 2, 1]
    ].forEach((grade) => {
      const exists = db.prepare(`
        SELECT 1 FROM grades
        WHERE trainee_id = ? AND fach = ? AND typ = ? AND bezeichnung = ? AND datum = ?
      `).get(trainee.id, grade[0], grade[1], grade[2], grade[3]);
      if (exists) {
        return;
      }

      insertGrade.run(trainee.id, grade[0], grade[1], grade[2], grade[3], grade[4], grade[5]);
    });
}

initDb();
migrateUserSchema();
migrateEntrySchema();
ensureDemoUsers();
syncEducationsFromUsers();
migrateTrainerAssignments();
migrateLegacyJson();
ensureDemoData();
syncEducationsFromUsers();
migrateTrainerAssignments();

const defaultTrainee = db.prepare("SELECT id FROM users WHERE role = 'trainee' ORDER BY id ASC LIMIT 1").get();
if (defaultTrainee) {
  db.prepare("UPDATE entries SET trainee_id = ? WHERE trainee_id IS NULL").run(defaultTrainee.id);
}

app.use(express.json({ limit: "15mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use("/Pictures", express.static(path.join(__dirname, "Pictures")));
app.use(
  session({
    name: sessionCookieName,
    secret: sessionSecret || "berichtsheft-dev-secret",
    resave: false,
    saveUninitialized: false,
    proxy: trustProxy,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use(express.static(path.join(__dirname, "public")));

function withoutPassword(user) {
  if (!user) {
    return null;
  }
  const { password_hash, ...rest } = user;
  return rest;
}

function normalizeEducationName(value) {
  return String(value || "").trim();
}

function parseTrainerIds(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return [...new Set(
    input
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];
}

function listEducations() {
  return db.prepare(`
    SELECT id, name
    FROM educations
    ORDER BY name COLLATE NOCASE ASC
  `).all();
}

function saveEducation(name) {
  const normalized = normalizeEducationName(name);
  if (!normalized) {
    return "";
  }
  db.prepare("INSERT OR IGNORE INTO educations (name) VALUES (?)").run(normalized);
  return normalized;
}

function getTrainerIdsForTrainee(traineeId) {
  return db.prepare(`
    SELECT trainer_id
    FROM trainee_trainers
    WHERE trainee_id = ?
    ORDER BY trainer_id ASC
  `).all(traineeId).map((row) => row.trainer_id);
}

function getTraineeIdsForTrainer(trainerId) {
  return db.prepare(`
    SELECT trainee_id
    FROM trainee_trainers
    WHERE trainer_id = ?
    ORDER BY trainee_id ASC
  `).all(trainerId).map((row) => row.trainee_id);
}

function listUsersWithRelations() {
  const users = db.prepare(`
    SELECT id, name, username, email, role, ausbildung, betrieb, berufsschule,
           theme_preference AS themePreference
    FROM users
    ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'trainer' THEN 2 ELSE 3 END, name COLLATE NOCASE ASC
  `).all();

  const assignments = db.prepare(`
    SELECT trainee_id, trainer_id
    FROM trainee_trainers
  `).all();

  const userMap = new Map(users.map((user) => [user.id, {
    ...user,
    trainerIds: [],
    traineeIds: [],
    assignedTrainers: [],
    assignedTrainees: []
  }]));

  for (const assignment of assignments) {
    const trainee = userMap.get(assignment.trainee_id);
    const trainer = userMap.get(assignment.trainer_id);
    if (!trainee || !trainer) {
      continue;
    }

    trainee.trainerIds.push(trainer.id);
    trainee.assignedTrainers.push({ id: trainer.id, name: trainer.name, email: trainer.email });
    trainer.traineeIds.push(trainee.id);
    trainer.assignedTrainees.push({ id: trainee.id, name: trainee.name, email: trainee.email, ausbildung: trainee.ausbildung });
  }

  return users.map((user) => userMap.get(user.id));
}

function listTraineesForTrainer(trainerId) {
  return db.prepare(`
    SELECT users.id, users.name, users.username, users.email, users.ausbildung, users.betrieb, users.berufsschule
    FROM users
    JOIN trainee_trainers ON trainee_trainers.trainee_id = users.id
    WHERE users.role = 'trainee' AND trainee_trainers.trainer_id = ?
    ORDER BY users.name COLLATE NOCASE ASC
  `).all(trainerId);
}

function isTrainerAssignedToTrainee(trainerId, traineeId) {
  const assignment = db.prepare(`
    SELECT 1
    FROM trainee_trainers
    WHERE trainee_id = ? AND trainer_id = ?
    LIMIT 1
  `).get(traineeId, trainerId);
  return Boolean(assignment);
}

function syncTraineeTrainerAssignments(traineeId, trainerIds) {
  const uniqueTrainerIds = [...new Set(trainerIds)];
  const existingIds = new Set(getTrainerIdsForTrainee(traineeId));
  const insertAssignment = db.prepare("INSERT OR IGNORE INTO trainee_trainers (trainee_id, trainer_id) VALUES (?, ?)");
  const deleteAssignment = db.prepare("DELETE FROM trainee_trainers WHERE trainee_id = ? AND trainer_id = ?");

  for (const trainerId of uniqueTrainerIds) {
    if (!existingIds.has(trainerId)) {
      insertAssignment.run(traineeId, trainerId);
    }
  }

  for (const trainerId of existingIds) {
    if (!uniqueTrainerIds.includes(trainerId)) {
      deleteAssignment.run(traineeId, trainerId);
    }
  }
}

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

function getLoginIdentifier(req) {
  return String(req.body?.identifier || req.body?.email || "").trim().toLowerCase();
}

function isLoginRateLimited(req) {
  const key = `${getClientIp(req)}:${getLoginIdentifier(req)}`;
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry) {
    return false;
  }

  if (now > entry.resetAt) {
    loginAttempts.delete(key);
    return false;
  }

  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(req) {
  const key = `${getClientIp(req)}:${getLoginIdentifier(req)}`;
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || now > current.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  current.count += 1;
  loginAttempts.set(key, current);
}

function clearLoginFailures(req) {
  const key = `${getClientIp(req)}:${getLoginIdentifier(req)}`;
  loginAttempts.delete(key);
}

function getCurrentUser(req) {
  if (!req.session.userId) {
    return null;
  }

  const user = db.prepare(`
    SELECT id, name, username, email, role, ausbildung, betrieb, berufsschule,
           theme_preference AS themePreference
    FROM users
    WHERE id = ?
  `).get(req.session.userId);

  if (!user) {
    return null;
  }

  if (user.role === "trainee") {
    user.trainerIds = getTrainerIdsForTrainee(user.id);
  }

  if (user.role === "trainer") {
    user.traineeIds = getTraineeIdsForTrainer(user.id);
  }

  return user;
}

function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Nicht eingeloggt." });
  }
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Nicht eingeloggt." });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Keine Berechtigung." });
    }
    req.user = user;
    next();
  };
}

function listEntriesForTrainee(traineeId) {
  return db.prepare(`
    SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule,
           status, signedAt, signerName, trainerComment, rejectionReason
    FROM entries
    WHERE trainee_id = ?
    ORDER BY dateFrom DESC, id DESC
  `).all(traineeId);
}

function weightForGradeType(type) {
  return type === "Schulaufgabe" ? 2 : 1;
}

function listGradesForTrainee(traineeId) {
  return db.prepare(`
    SELECT id, fach, typ, bezeichnung, datum, note, gewicht
    FROM grades
    WHERE trainee_id = ?
    ORDER BY datum DESC, id DESC
  `).all(traineeId);
}

function validateGrade(input) {
  const fach = String(input.fach || "").trim();
  const typ = String(input.typ || "").trim();
  const bezeichnung = String(input.bezeichnung || "").trim();
  const datum = String(input.datum || "").trim();
  const note = Number(input.note);

  if (!fach || !["Schulaufgabe", "Stegreifaufgabe"].includes(typ) || !bezeichnung || !datum || !Number.isFinite(note)) {
    return { error: "Ungueltige Notendaten." };
  }

  if (note < 1 || note > 6) {
    return { error: "Note muss zwischen 1 und 6 liegen." };
  }

  return {
    data: {
      id: input.id ? Number(input.id) : null,
      fach,
      typ,
      bezeichnung,
      datum,
      note,
      gewicht: weightForGradeType(typ)
    }
  };
}

function validateEntry(entry) {
  const missing = [];
  if (!entry.weekLabel) missing.push("Titel");
  if (!entry.dateFrom) missing.push("Tag");
  if (!entry.betrieb && !entry.schule) {
    missing.push("Betrieb oder Berufsschule");
  }
  return missing;
}

function findEntryById(traineeId, entryId) {
  return db.prepare(`
    SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule,
           status, signedAt, signerName, trainerComment, rejectionReason
    FROM entries
    WHERE trainee_id = ? AND id = ?
    LIMIT 1
  `).get(traineeId, entryId);
}

function findEntryByDate(traineeId, dateFrom) {
  return db.prepare(`
    SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule,
           status, signedAt, signerName, trainerComment, rejectionReason
    FROM entries
    WHERE trainee_id = ? AND dateFrom = ?
    LIMIT 1
  `).get(traineeId, dateFrom);
}

function createDraftEntry(user, payload) {
  const entry = normalizeEntry(payload || {});
  if (!entry.dateFrom) {
    return { error: "Tag fehlt.", status: 400, code: "ENTRY_DATE_REQUIRED" };
  }

  const existing = findEntryByDate(user.id, entry.dateFrom);
  if (existing) {
    return { ok: true, entry: existing, created: false };
  }

  const insertEntry = db.prepare(`
    INSERT INTO entries (
      id, trainee_id, weekLabel, dateFrom, dateTo, betrieb, schule, themen, reflection,
      status, signedAt, signerName, trainerComment, rejectionReason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 'draft', NULL, '', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const entryId = entry.id || `entry-${Date.now()}-${Math.random()}`;
  insertEntry.run(
    entryId,
    user.id,
    entry.weekLabel || `Bericht ${entry.dateFrom}`,
    entry.dateFrom,
    entry.dateTo || entry.dateFrom,
    "",
    ""
  );

  return {
    ok: true,
    created: true,
    entry: findEntryById(user.id, entryId)
  };
}

function updateTraineeEntry(user, entryId, payload) {
  const existing = findEntryById(user.id, entryId);
  if (!existing) {
    return { error: "Eintrag nicht gefunden.", status: 404, code: "ENTRY_NOT_FOUND" };
  }

  const entry = normalizeEntry({ ...existing, ...(payload || {}), id: entryId });
  const contentChanged =
    entry.weekLabel !== existing.weekLabel ||
    entry.dateFrom !== existing.dateFrom ||
    entry.dateTo !== existing.dateTo ||
    entry.betrieb !== existing.betrieb ||
    entry.schule !== existing.schule;

  if (existing.status === "signed" && contentChanged) {
    return { error: "Signierte Eintraege koennen nicht bearbeitet oder geloescht werden.", status: 400, code: "ENTRY_SIGNED_LOCKED" };
  }

  if (existing.status === "submitted" && contentChanged) {
    return {
      error: "Eingereichte Eintraege sind schreibgeschuetzt, bis sie zur Nachbearbeitung zurueckgegeben werden.",
      status: 400,
      code: "ENTRY_SUBMITTED_LOCKED"
    };
  }

  const conflictingEntry = db.prepare(`
    SELECT id
    FROM entries
    WHERE trainee_id = ? AND dateFrom = ? AND id != ?
    LIMIT 1
  `).get(user.id, entry.dateFrom, entryId);
  if (conflictingEntry) {
    return { error: `Fuer ${entry.dateFrom} existiert bereits ein Tagesbericht.`, status: 400, code: "ENTRY_DATE_CONFLICT" };
  }

  let nextStatus = existing.status;
  let nextSignedAt = existing.signedAt;
  let nextSignerName = existing.signerName;
  let nextTrainerComment = existing.trainerComment;
  let nextRejectionReason = existing.rejectionReason;

  if (contentChanged && existing.status === "rejected") {
    nextStatus = "draft";
    nextSignedAt = null;
    nextSignerName = "";
    nextTrainerComment = "";
    nextRejectionReason = "";
  }

  db.prepare(`
    UPDATE entries
    SET weekLabel = ?, dateFrom = ?, dateTo = ?, betrieb = ?, schule = ?, status = ?, signedAt = ?, signerName = ?, trainerComment = ?, rejectionReason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND trainee_id = ?
  `).run(
    entry.weekLabel,
    entry.dateFrom,
    entry.dateTo || entry.dateFrom,
    entry.betrieb,
    entry.schule,
    nextStatus,
    nextSignedAt,
    nextSignerName,
    nextTrainerComment,
    nextRejectionReason,
    entryId,
    user.id
  );

  return { ok: true, entry: findEntryById(user.id, entryId) };
}

function validateProfilePayload(input) {
  const profile = {
    name: String(input?.name || "").trim(),
    ausbildung: String(input?.ausbildung || "").trim(),
    betrieb: String(input?.betrieb || "").trim(),
    berufsschule: String(input?.berufsschule || "").trim()
  };

  if (!profile.name) {
    return { error: "Name fehlt." };
  }

  return { data: profile };
}

function validateAdminUserPayload(input, { requirePassword = false } = {}) {
  const name = String(input?.name || "").trim();
  const username = normalizeUsername(input?.username);
  const email = String(input?.email || "").trim().toLowerCase();
  const role = String(input?.role || "").trim();
  const password = String(input?.password || "");
  const ausbildung = normalizeEducationName(input?.ausbildung);
  const betrieb = String(input?.betrieb || "").trim();
  const berufsschule = String(input?.berufsschule || "").trim();
  const trainerIds = role === "trainee" ? parseTrainerIds(input?.trainerIds) : [];

  if (!name || !username || !email || !["trainee", "trainer", "admin"].includes(role)) {
    return { error: "Ungueltige Nutzerdaten." };
  }

  if (!isValidEmail(email)) {
    return { error: "E-Mail-Adresse ist ungueltig." };
  }

  if (requirePassword && !password) {
    return { error: "Passwort fehlt." };
  }

  if (password && password.length < 10) {
    return { error: "Passwort muss mindestens 10 Zeichen lang sein." };
  }

  if (role === "trainee" && !ausbildung) {
    return { error: "Azubis benoetigen eine Ausbildung." };
  }

  return {
    data: {
      name,
      username,
      email,
      role,
      password,
      ausbildung,
      betrieb,
      berufsschule,
      trainerIds
    }
  };
}

function validateThemePreferencePayload(input) {
  return {
    data: {
      themePreference: normalizeThemePreference(input?.themePreference)
    }
  };
}

function parseImportRows(filename, contentBase64) {
  if (!filename || !contentBase64) {
    return { error: "Dateiinhalt fehlt." };
  }

  const buffer = Buffer.from(String(contentBase64), "base64");
  if (!buffer.length) {
    return { error: "Datei konnte nicht gelesen werden." };
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (error) {
    return { error: "Datei konnte nicht verarbeitet werden. Bitte eine gueltige .xlsx- oder .csv-Datei verwenden." };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { error: "Die Datei enthaelt kein Tabellenblatt." };
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, defval: "", raw: true });
  if (!rows.length) {
    return { error: "Die Datei enthaelt keine Daten." };
  }

  return { rows };
}

function detectImportColumns(headerRow) {
  const mapping = {};
  const normalizedHeader = headerRow.map((cell) =>
    String(cell || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
  );

  const aliases = {
    dateFrom: ["datum", "tag", "date", "datefrom"],
    weekLabel: ["titel", "title", "bericht", "weeklabel", "bezeichnung"],
    betrieb: ["betrieb", "arbeit", "work"],
    schule: ["berufsschule", "schule", "school", "unterricht"]
  };

  Object.entries(aliases).forEach(([field, values]) => {
    const index = normalizedHeader.findIndex((item) => values.includes(item));
    if (index >= 0) {
      mapping[field] = index;
    }
  });

  return mapping;
}

function buildImportPreview(user, payload) {
  const parsed = parseImportRows(payload?.filename, payload?.contentBase64);
  if (parsed.error) {
    return parsed;
  }

  const rows = parsed.rows;
  const mapping = detectImportColumns(rows[0] || []);
  if (mapping.dateFrom === undefined || mapping.weekLabel === undefined) {
    return { error: "Die Importdatei braucht mindestens die Spalten 'Datum' und 'Titel'." };
  }

  const existingByDate = new Map(listEntriesForTrainee(user.id).map((entry) => [entry.dateFrom, entry]));
  const seenDates = new Map();
  const previewRows = [];

  for (let index = 1; index < rows.length; index += 1) {
    const rawRow = rows[index];
    const rowNumber = index + 1;
    const dateFrom = parseImportedDate(rawRow[mapping.dateFrom]);
    const weekLabel = String(rawRow[mapping.weekLabel] || "").trim();
    const betrieb = String(mapping.betrieb !== undefined ? rawRow[mapping.betrieb] || "" : "").trim();
    const schule = String(mapping.schule !== undefined ? rawRow[mapping.schule] || "" : "").trim();
    const errors = [];
    const warnings = [];

    if (!dateFrom && !weekLabel && !betrieb && !schule) {
      continue;
    }

    if (!dateFrom) errors.push("Datum fehlt oder ist ungueltig");
    if (!weekLabel) errors.push("Titel fehlt");
    if (!betrieb && !schule) errors.push("Betrieb oder Berufsschule muss befuellt sein");

    if (dateFrom && seenDates.has(dateFrom)) {
      errors.push(`Doppelter Tag in Importdatei (Zeile ${seenDates.get(dateFrom)})`);
    } else if (dateFrom) {
      seenDates.set(dateFrom, rowNumber);
    }

    if (dateFrom && existingByDate.has(dateFrom)) {
      warnings.push("Fuer diesen Tag existiert bereits ein Bericht und die Zeile wird beim Import uebersprungen");
    }

    previewRows.push({
      rowNumber,
      weekLabel,
      dateFrom,
      betrieb,
      schule,
      status: "submitted",
      errors,
      warnings,
      canImport: !errors.length && !existingByDate.has(dateFrom)
    });
  }

  const validRows = previewRows.filter((row) => row.canImport);
  const invalidRows = previewRows.filter((row) => !row.canImport);

  return {
    ok: true,
    mapping,
    summary: {
      totalRows: previewRows.length,
      validRows: validRows.length,
      invalidRows: invalidRows.length
    },
    rows: previewRows
  };
}

function getExistingEntriesMap(traineeId) {
  const rows = db.prepare(`
    SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule,
           status, signedAt, signerName, trainerComment, rejectionReason
    FROM entries
    WHERE trainee_id = ?
  `).all(traineeId);
  return new Map(rows.map((row) => [row.id, row]));
}

function ensureUniqueEntryDates(traineeId, entries) {
  const seenDates = new Set();

  for (const entry of entries) {
    if (!entry.dateFrom) {
      continue;
    }

    if (seenDates.has(entry.dateFrom)) {
      return { error: `Pro Tag ist nur ein Tagesbericht erlaubt: ${entry.dateFrom}` };
    }

    seenDates.add(entry.dateFrom);
  }

  const conflictingEntry = db.prepare(`
    SELECT id, dateFrom
    FROM entries
    WHERE trainee_id = ? AND dateFrom = ? AND id != ?
    LIMIT 1
  `);

  for (const entry of entries) {
    if (!entry.dateFrom) {
      continue;
    }

    const conflict = conflictingEntry.get(traineeId, entry.dateFrom, entry.id);
    if (conflict) {
      return { error: `Fuer ${entry.dateFrom} existiert bereits ein Tagesbericht.` };
    }
  }

  return null;
}

function getTraineeDashboard(user) {
  return {
    userId: user.id,
    trainee: {
      name: user.name,
      ausbildung: user.ausbildung,
      betrieb: user.betrieb,
      berufsschule: user.berufsschule
    },
    entries: listEntriesForTrainee(user.id),
    grades: listGradesForTrainee(user.id)
  };
}

function getTrainerDashboard(user) {
  const trainees = listTraineesForTrainer(user.id);

  return trainees.map((trainee) => ({
    ...trainee,
    trainerIds: getTrainerIdsForTrainee(trainee.id),
    entries: listEntriesForTrainee(trainee.id)
  }));
}

function upsertTraineeEntries(user, payload) {
  const entries = Array.isArray(payload.entries) ? payload.entries.map(normalizeEntry) : [];
  const existingEntries = getExistingEntriesMap(user.id);
  const duplicateDateError = ensureUniqueEntryDates(user.id, entries);
  if (duplicateDateError) {
    return duplicateDateError;
  }

  for (const entry of entries) {
    const existing = existingEntries.get(entry.id);
    if (existing) {
      const contentChanged =
        entry.weekLabel !== existing.weekLabel ||
        entry.dateFrom !== existing.dateFrom ||
        entry.dateTo !== existing.dateTo ||
        entry.betrieb !== existing.betrieb ||
        entry.schule !== existing.schule;

      entry.status = existing.status;
      entry.signedAt = existing.signedAt;
      entry.signerName = existing.signerName;
      entry.trainerComment = existing.trainerComment;
      entry.rejectionReason = existing.rejectionReason;

      if (existing.status === "signed" && contentChanged) {
        return { error: "Signierte Eintraege koennen nicht bearbeitet oder geloescht werden.", code: "ENTRY_SIGNED_LOCKED", status: 400 };
      }

      if (existing.status === "submitted" && contentChanged) {
        return { error: "Eingereichte Eintraege sind schreibgeschuetzt, bis sie zur Nachbearbeitung zurueckgegeben werden.", code: "ENTRY_SUBMITTED_LOCKED", status: 400 };
      }

      if (contentChanged && existing.status === "rejected") {
        entry.status = "draft";
        entry.signedAt = null;
        entry.signerName = "";
        entry.trainerComment = "";
        entry.rejectionReason = "";
      }
    }
  }

  const transaction = db.transaction(() => {
    const updateEntry = db.prepare(`
      UPDATE entries
      SET weekLabel = ?, dateFrom = ?, dateTo = ?, betrieb = ?, schule = ?, status = ?, signedAt = ?, signerName = ?, trainerComment = ?, rejectionReason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND trainee_id = ? AND status != 'signed'
    `);
    const insertEntry = db.prepare(`
      INSERT INTO entries (
        id, trainee_id, weekLabel, dateFrom, dateTo, betrieb, schule, themen, reflection,
        status, signedAt, signerName, trainerComment, rejectionReason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    for (const entry of entries) {
      const existing = existingEntries.get(entry.id);
      if (existing) {
        updateEntry.run(
          entry.weekLabel,
          entry.dateFrom,
          entry.dateTo,
          entry.betrieb,
          entry.schule,
          entry.status,
          entry.signedAt,
          entry.signerName,
          entry.trainerComment,
          entry.rejectionReason,
          entry.id,
          user.id
        );
        continue;
      }

      insertEntry.run(
        entry.id,
        user.id,
        entry.weekLabel,
        entry.dateFrom,
        entry.dateTo,
        entry.betrieb,
        entry.schule,
        "",
        "",
        "draft",
        null,
        "",
        "",
        ""
      );
    }
  });

  try {
    transaction();
    return { ok: true };
  } catch (error) {
    if (String(error.message || "").includes("idx_entries_trainee_date") || String(error.message || "").includes("UNIQUE constraint failed")) {
      return { error: "Pro Tag ist nur ein Tagesbericht erlaubt." };
    }
    throw error;
  }
}

function renderPdf(res, trainee, entries) {
  const logoPath = path.join(__dirname, "Pictures", "WIWEB-waage-vektor_ohne_schrift.png");
  const sortedEntries = [...entries]
    .filter((entry) => entry.status === "signed")
    .sort((a, b) => String(a.dateFrom).localeCompare(String(b.dateFrom)));
  const weekGroups = [];

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      const [year, month, day] = String(value).split("-");
      return `${day}.${month}.${year}`;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function toDate(value) {
    if (!value) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return new Date(`${value}T00:00:00`);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getIsoWeekInfo(value) {
    const date = toDate(value);
    if (!date) {
      return null;
    }

    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    return { year: utc.getUTCFullYear(), week };
  }

  let currentGroup = null;
  for (const entry of sortedEntries) {
    const weekInfo = getIsoWeekInfo(entry.dateFrom);
    const groupKey = weekInfo ? `${weekInfo.year}-${String(weekInfo.week).padStart(2, "0")}` : `unknown-${entry.id}`;

    if (!currentGroup || currentGroup.key !== groupKey) {
      currentGroup = {
        key: groupKey,
        week: weekInfo?.week || "-",
        year: weekInfo?.year || "-",
        entries: []
      };
      weekGroups.push(currentGroup);
    }

    currentGroup.entries.push(entry);
  }

  const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });
  const pageBottomY = doc.page.height - doc.page.margins.bottom;
  const cardX = 50;
  const cardWidth = 495;
  const cardPadding = 16;
  const innerX = cardX + cardPadding;
  const innerWidth = cardWidth - (cardPadding * 2);
  const cardGap = 14;
  const contentStartY = 245;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="berichtsheft-${trainee.name.replace(/\s+/g, "-").toLowerCase()}.pdf"`);
  doc.pipe(res);

  function renderHeader(pageTitle, weekLabel = "") {
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 42, { fit: [64, 64] });
    }

    doc.font("Helvetica-Bold").fontSize(22).text("Berichtsheft", 130, 50);
    doc.font("Helvetica").fontSize(11);
    doc.text(`Name: ${trainee.name}`, 130, 80);
    doc.text(`Ausbildung: ${trainee.ausbildung || "-"}`, 130, 96);
    doc.text(`Betrieb: ${trainee.betrieb || "-"}`, 130, 112);
    doc.text(`Berufsschule: ${trainee.berufsschule || "-"}`, 130, 128);
    doc.text(`Stand: ${formatDate(new Date())}`, 130, 144);

    doc.font("Helvetica-Bold").fontSize(15).text(pageTitle, 50, 182);
    if (weekLabel) {
      doc.font("Helvetica").fontSize(11).text(weekLabel, 50, 202);
    }

    doc.moveTo(50, 225).lineTo(545, 225).strokeColor("#B7C7C1").lineWidth(1).stroke();
  }

  function normalizePdfText(value) {
    if (value == null) return "";
    return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
  }

  function hasMeaningfulPdfContent(value) {
    const normalized = normalizePdfText(value).trim();
    if (!normalized) {
      return false;
    }

    return !/^[-\s]+$/.test(normalized);
  }

  function buildEntryBody(entry) {
    const sections = [];

    if (hasMeaningfulPdfContent(entry.betrieb)) {
      sections.push(["Betrieb", normalizePdfText(entry.betrieb).trim()]);
    }

    if (hasMeaningfulPdfContent(entry.schule)) {
      sections.push(["Berufsschule", normalizePdfText(entry.schule).trim()]);
    }

    if (entry.trainerComment) {
      sections.push(["Kommentar Ausbilder", normalizePdfText(entry.trainerComment)]);
    }

    if (entry.rejectionReason) {
      sections.push(["Rueckmeldung", normalizePdfText(entry.rejectionReason)]);
    }

    if (!sections.length) {
      return "Keine Inhalte hinterlegt.";
    }

    return sections
      .map(([label, content]) => `${label}\n${content}`)
      .join("\n\n");
  }

  function measureTextHeight(text, options) {
    return doc.heightOfString(text || "-", options);
  }

  function fitTextToHeight(text, options, maxHeight) {
    const normalizedText = text || "-";
    if (!normalizedText || maxHeight <= 0) {
      return { fittingText: "", remainingText: normalizedText };
    }

    const fullHeight = measureTextHeight(normalizedText, options);
    if (fullHeight <= maxHeight) {
      return { fittingText: normalizedText, remainingText: "" };
    }

    let low = 1;
    let high = normalizedText.length;
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const slice = normalizedText.slice(0, mid);
      const sliceHeight = measureTextHeight(slice, options);
      if (sliceHeight <= maxHeight) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (!best) {
      return { fittingText: "", remainingText: normalizedText };
    }

    const searchWindowStart = Math.max(0, best - 120);
    const tail = normalizedText.slice(searchWindowStart, best);
    const breakMatch = tail.match(/[\n\s](?!.*[\n\s])/);
    let cutIndex = best;

    if (breakMatch) {
      cutIndex = searchWindowStart + breakMatch.index + 1;
    }

    if (cutIndex <= 0) {
      cutIndex = best;
    }

    const fittingText = normalizedText.slice(0, cutIndex).trimEnd();
    const remainingText = normalizedText.slice(cutIndex).replace(/^\n/, "");
    return {
      fittingText: fittingText || normalizedText.slice(0, best),
      remainingText
    };
  }

  function drawEntryCard(boxTop, title, statusText, bodyText) {
    const titleOptions = { width: innerWidth, lineGap: 1 };
    const metaOptions = { width: innerWidth, lineGap: 1 };
    const bodyOptions = { width: innerWidth, lineGap: 2 };
    const titleHeight = measureTextHeight(title, titleOptions);
    const metaHeight = measureTextHeight(statusText, metaOptions);
    const bodyHeight = measureTextHeight(bodyText, bodyOptions);
    const boxHeight = cardPadding + titleHeight + 6 + metaHeight + 12 + bodyHeight + cardPadding;

    doc.roundedRect(cardX, boxTop, cardWidth, boxHeight, 10).fillAndStroke("#F7FAF8", "#D7E1DB");
    doc.fillColor("#11211F").font("Helvetica-Bold").fontSize(11).text(title, innerX, boxTop + cardPadding, titleOptions);
    doc.font("Helvetica").fontSize(9.5).fillColor("#4B5F5B").text(statusText, innerX, boxTop + cardPadding + titleHeight + 6, metaOptions);
    doc.font("Helvetica").fontSize(10).fillColor("#11211F").text(bodyText, innerX, boxTop + cardPadding + titleHeight + 6 + metaHeight + 12, bodyOptions);

    return boxHeight;
  }

  function renderEntryAcrossPages(entry, weekTitle, weekRange, cursorY) {
    const baseTitle = `${formatDate(entry.dateFrom)} · ${entry.weekLabel || "Ohne Titel"}`;
    const statusText = entry.status === "signed"
      ? `Signiert von ${entry.signerName || "-"} am ${formatDateTime(entry.signedAt)}`
      : `Status: ${entry.status}`;
    const bodyText = buildEntryBody(entry);
    const titleOptions = { width: innerWidth, lineGap: 1 };
    const metaOptions = { width: innerWidth, lineGap: 1 };
    const bodyOptions = { width: innerWidth, lineGap: 2 };
    const titleHeight = measureTextHeight(baseTitle, titleOptions);
    const metaHeight = measureTextHeight(statusText, metaOptions);
    const fixedContentHeight = cardPadding + titleHeight + 6 + metaHeight + 12 + cardPadding;

    let remainingBody = bodyText;
    let segmentIndex = 0;

    while (remainingBody) {
      let availableHeight = pageBottomY - cursorY;
      if (availableHeight <= fixedContentHeight + 24) {
        doc.addPage();
        renderHeader(weekTitle, weekRange);
        cursorY = contentStartY;
        availableHeight = pageBottomY - cursorY;
      }

      const availableBodyHeight = availableHeight - fixedContentHeight;
      const { fittingText, remainingText } = fitTextToHeight(remainingBody, bodyOptions, availableBodyHeight);

      if (!fittingText) {
        doc.addPage();
        renderHeader(weekTitle, weekRange);
        cursorY = contentStartY;
        continue;
      }

      const segmentTitle = segmentIndex > 0 ? `${baseTitle} (Fortsetzung)` : baseTitle;
      const boxHeight = drawEntryCard(cursorY, segmentTitle, statusText, fittingText);
      cursorY += boxHeight + cardGap;
      remainingBody = remainingText;
      segmentIndex += 1;

      if (remainingBody) {
        doc.addPage();
        renderHeader(weekTitle, weekRange);
        cursorY = contentStartY;
      }
    }

    return cursorY;
  }

  if (!weekGroups.length) {
    renderHeader("Keine Tagesberichte vorhanden");
    doc.font("Helvetica").fontSize(12).text("Aktuell sind keine Einträge für den PDF-Export vorhanden.", 50, 250);
    doc.end();
    return;
  }

  weekGroups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      doc.addPage();
    }

    const firstDate = formatDate(group.entries[0]?.dateFrom);
    const lastDate = formatDate(group.entries[group.entries.length - 1]?.dateFrom);
    const weekTitle = `KW ${group.week}/${group.year}`;
    const weekRange = `${firstDate} bis ${lastDate}`;
    renderHeader(weekTitle, weekRange);

    let cursorY = contentStartY;

    group.entries.forEach((entry) => {
      cursorY = renderEntryAcrossPages(entry, weekTitle, weekRange, cursorY);
    });
  });

  doc.addPage();
  renderHeader("Unterschriften");
  doc.font("Helvetica-Bold").fontSize(12).text("Bestaetigung", 50, 310);
  doc.font("Helvetica").fontSize(11).text("Hiermit wird bestaetigt, dass die Berichtsheftfuehrung geprueft wurde.", 50, 332, { width: 495 });
  doc.moveTo(50, 430).lineTo(260, 430).strokeColor("#526763").lineWidth(1).stroke();
  doc.moveTo(320, 430).lineTo(545, 430).strokeColor("#526763").lineWidth(1).stroke();
  doc.fillColor("#5D6F6A").font("Helvetica").fontSize(10).text("Ort, Datum", 50, 438);
  doc.text("Unterschrift Azubi", 320, 438);
  doc.moveTo(50, 520).lineTo(260, 520).strokeColor("#526763").lineWidth(1).stroke();
  doc.moveTo(320, 520).lineTo(545, 520).strokeColor("#526763").lineWidth(1).stroke();
  doc.text("Ort, Datum", 50, 528);
  doc.text("Unterschrift Ausbilder", 320, 528);

  doc.end();
}

function renderGradesPdf(res, trainee, grades) {
  const logoPath = path.join(__dirname, "Pictures", "WIWEB-waage-vektor_ohne_schrift.png");
  const sortedGrades = [...grades].sort((a, b) => {
    const bySubject = String(a.fach).localeCompare(String(b.fach), "de");
    if (bySubject !== 0) {
      return bySubject;
    }
    return String(a.datum).localeCompare(String(b.datum));
  });

  function formatDate(value) {
    if (!value) return "-";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      const [year, month, day] = String(value).split("-");
      return `${day}.${month}.${year}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="noten-${trainee.name.replace(/\s+/g, "-").toLowerCase()}.pdf"`);
  doc.pipe(res);

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 42, { fit: [64, 64] });
  }

  doc.font("Helvetica-Bold").fontSize(22).text("Notenuebersicht", 130, 50);
  doc.font("Helvetica").fontSize(11);
  doc.text(`Name: ${trainee.name}`, 130, 82);
  doc.text(`Ausbildung: ${trainee.ausbildung || "-"}`, 130, 98);
  doc.text(`Stand: ${formatDate(new Date())}`, 130, 114);
  doc.moveTo(50, 150).lineTo(545, 150).strokeColor("#B7C7C1").lineWidth(1).stroke();

  if (!sortedGrades.length) {
    doc.font("Helvetica").fontSize(12).fillColor("#11211F").text("Aktuell sind keine Noten vorhanden.", 50, 180);
    doc.end();
    return;
  }

  const drawHeader = (y) => {
    doc.roundedRect(50, y, 495, 24, 6).fillAndStroke("#E9F1ED", "#D7E1DB");
    doc.fillColor("#11211F").font("Helvetica-Bold").fontSize(10);
    doc.text("Fach", 54, y + 7, { width: 96 });
    doc.text("Art", 150, y + 7, { width: 110 });
    doc.text("Bezeichnung", 260, y + 7, { width: 130 });
    doc.text("Datum", 390, y + 7, { width: 70 });
    doc.text("Note", 460, y + 7, { width: 40, align: "center" });
    doc.text("Gew.", 500, y + 7, { width: 40, align: "center" });
  };

  const drawRow = (grade, y) => {
    doc.fillColor("#11211F").font("Helvetica").fontSize(10);
    doc.text(grade.fach || "-", 54, y + 7, { width: 92, ellipsis: true });
    doc.text(grade.typ || "-", 150, y + 7, { width: 106, ellipsis: true });
    doc.text(grade.bezeichnung || "-", 260, y + 7, { width: 126, ellipsis: true });
    doc.text(formatDate(grade.datum), 390, y + 7, { width: 70 });
    doc.text(String(grade.note ?? "-"), 460, y + 7, { width: 40, align: "center" });
    doc.text(String(grade.gewicht ?? "-"), 500, y + 7, { width: 40, align: "center" });
    doc.moveTo(50, y + 28).lineTo(545, y + 28).strokeColor("#E2EAE6").lineWidth(1).stroke();
  };

  let cursorY = 170;
  drawHeader(cursorY);
  cursorY += 28;

  sortedGrades.forEach((grade) => {
    if (cursorY > 770) {
      doc.addPage();
      cursorY = 60;
      drawHeader(cursorY);
      cursorY += 28;
    }
    drawRow(grade, cursorY);
    cursorY += 28;
  });

  doc.end();
}

app.get("/api/session", (req, res) => {
  const user = getCurrentUser(req);
  res.json({ user });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, status: "healthy" });
});

app.post("/api/login", (req, res) => {
  if (isLoginRateLimited(req)) {
    return res.status(429).json({ error: "Zu viele Login-Versuche. Bitte spaeter erneut versuchen." });
  }

  const identifier = String(req.body?.identifier || req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ? OR username = ?").get(identifier, identifier);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordLoginFailure(req);
    return res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
  }

  clearLoginFailures(req);
  req.session.userId = user.id;
  const { theme_preference, ...safeUser } = user;
  res.json({
    ok: true,
    user: withoutPassword({
      ...safeUser,
      themePreference: normalizeThemePreference(theme_preference)
    })
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/dashboard", requireAuth, (req, res) => {
  if (req.user.role === "trainee") {
    return res.json({ role: "trainee", report: getTraineeDashboard(req.user) });
  }

  if (req.user.role === "trainer") {
    return res.json({ role: "trainer", trainees: getTrainerDashboard(req.user) });
  }

  res.json({ role: "admin", users: listUsersWithRelations(), educations: listEducations() });
});

app.post("/api/preferences/theme", requireAuth, (req, res) => {
  const result = validateThemePreferencePayload(req.body || {});
  db.prepare("UPDATE users SET theme_preference = ? WHERE id = ?").run(result.data.themePreference, req.user.id);
  res.json({ ok: true, themePreference: result.data.themePreference });
});

app.post("/api/report", requireRole("trainee"), (req, res) => {
  const result = upsertTraineeEntries(req.user, req.body || {});
  if (result?.error) {
    return res.status(result.status || 400).json({ error: result.error, code: result.code || "REPORT_UPDATE_FAILED" });
  }
  res.json({ ok: true, data: getTraineeDashboard(getCurrentUser(req)) });
});

app.post("/api/report/draft", requireRole("trainee"), (req, res) => {
  const result = createDraftEntry(req.user, req.body || {});
  if (result?.error) {
    return res.status(result.status || 400).json({ error: result.error, code: result.code || "REPORT_CREATE_FAILED" });
  }
  res.json({
    ok: true,
    created: Boolean(result.created),
    entry: result.entry,
    data: getTraineeDashboard(getCurrentUser(req))
  });
});

app.post("/api/report/entry/:entryId", requireRole("trainee"), (req, res) => {
  const entryId = String(req.params.entryId || "");
  const result = updateTraineeEntry(req.user, entryId, req.body || {});
  if (result?.error) {
    return res.status(result.status || 400).json({ error: result.error, code: result.code || "REPORT_ENTRY_UPDATE_FAILED" });
  }
  res.json({
    ok: true,
    entry: result.entry,
    data: getTraineeDashboard(getCurrentUser(req))
  });
});

app.post("/api/report/import-preview", requireRole("trainee"), (req, res) => {
  const preview = buildImportPreview(req.user, req.body || {});
  if (preview.error) {
    return res.status(400).json({ error: preview.error });
  }
  res.json(preview);
});

app.post("/api/report/import", requireRole("trainee"), (req, res) => {
  const preview = buildImportPreview(req.user, req.body || {});
  if (preview.error) {
    return res.status(400).json({ error: preview.error });
  }

  const rowsToImport = preview.rows.filter((row) => row.canImport);
  if (!rowsToImport.length) {
    return res.status(400).json({ error: "Keine gueltigen Zeilen zum Import vorhanden." });
  }

  const insertEntry = db.prepare(`
    INSERT INTO entries (
      id, trainee_id, weekLabel, dateFrom, dateTo, betrieb, schule, themen, reflection,
      status, signedAt, signerName, trainerComment, rejectionReason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 'submitted', NULL, '', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const transaction = db.transaction(() => {
    for (const row of rowsToImport) {
      insertEntry.run(
        `import-${Date.now()}-${Math.random()}`,
        req.user.id,
        row.weekLabel,
        row.dateFrom,
        row.dateFrom,
        row.betrieb,
        row.schule
      );
    }
  });

  try {
    transaction();
  } catch (error) {
    return res.status(400).json({ error: "Import konnte nicht gespeichert werden. Bitte Vorschau erneut laden und doppelte Tage pruefen." });
  }

  res.json({
    ok: true,
    importedCount: rowsToImport.length,
    skippedCount: preview.rows.length - rowsToImport.length,
    entries: listEntriesForTrainee(req.user.id)
  });
});

app.post("/api/profile/:userId", requireRole("trainer", "admin"), (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "Ungueltiger Nutzer." });
  }

  const trainee = db.prepare(`
    SELECT id, role
    FROM users
    WHERE id = ?
  `).get(userId);

  if (!trainee || trainee.role !== "trainee") {
    return res.status(404).json({ error: "Azubi nicht gefunden." });
  }

  if (req.user.role === "trainer" && !isTrainerAssignedToTrainee(req.user.id, trainee.id)) {
    return res.status(403).json({ error: "Profil gehoert nicht zu dir." });
  }

  const result = validateProfilePayload(req.body || {});
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  db.prepare(`
    UPDATE users
    SET name = ?, ausbildung = ?, betrieb = ?, berufsschule = ?
    WHERE id = ?
  `).run(result.data.name, result.data.ausbildung, result.data.betrieb, result.data.berufsschule, userId);
  saveEducation(result.data.ausbildung);

  res.json({ ok: true });
});

app.delete("/api/report/:entryId", requireRole("trainee"), (req, res) => {
  const entryId = String(req.params.entryId || "");
  const existing = db.prepare(`
    SELECT id, status
    FROM entries
    WHERE id = ? AND trainee_id = ?
  `).get(entryId, req.user.id);

  if (!existing) {
    return res.status(404).json({ error: "Eintrag nicht gefunden." });
  }

  if (existing.status !== "draft") {
    return res.status(400).json({ error: "Nur Entwuerfe koennen geloescht werden." });
  }

  db.prepare("DELETE FROM entries WHERE id = ? AND trainee_id = ? AND status = 'draft'").run(entryId, req.user.id);
  res.json({ ok: true, entries: listEntriesForTrainee(req.user.id) });
});

app.post("/api/report/submit", requireRole("trainee"), (req, res) => {
  const entryId = String(req.body?.entryId || "");
  const entry = db.prepare(`
    SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule, status
    FROM entries
    WHERE id = ? AND trainee_id = ?
  `).get(entryId, req.user.id);

  if (!entry) {
    return res.status(404).json({ error: "Eintrag nicht gefunden." });
  }

  const missing = validateEntry(entry);
  if (missing.length) {
    return res.status(400).json({ error: `Pflichtfelder fehlen: ${missing.join(", ")}` });
  }

  if (entry.status === "submitted") {
    return res.status(400).json({ error: "Eintrag ist bereits eingereicht." });
  }

  if (entry.status === "signed") {
    return res.status(400).json({ error: "Signierte Eintraege koennen nicht erneut eingereicht werden." });
  }

  const result = db.prepare(`
    UPDATE entries
    SET status = 'submitted', rejectionReason = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND trainee_id = ? AND status != 'signed'
  `).run(entryId, req.user.id);

  if (!result.changes) {
    return res.status(404).json({ error: "Eintrag nicht gefunden oder bereits signiert." });
  }

  res.json({ ok: true, entries: listEntriesForTrainee(req.user.id) });
});

app.post("/api/trainer/sign", requireRole("trainer", "admin"), (req, res) => {
  const entryId = String(req.body?.entryId || "");
  const trainerComment = String(req.body?.trainerComment || "").trim();

  const entry = db.prepare(`
    SELECT entries.id, entries.trainee_id, entries.status, entries.weekLabel, entries.dateFrom, entries.dateTo,
           entries.betrieb, entries.schule
    FROM entries
    WHERE entries.id = ?
  `).get(entryId);

  if (!entry) {
    return res.status(404).json({ error: "Eintrag nicht gefunden." });
  }

  if (req.user.role === "trainer" && !isTrainerAssignedToTrainee(req.user.id, entry.trainee_id)) {
    return res.status(403).json({ error: "Eintrag gehoert nicht zu dir." });
  }

  const missing = validateEntry(entry);
  if (missing.length) {
    return res.status(400).json({ error: `Eintrag ist unvollstaendig: ${missing.join(", ")}` });
  }

  if (entry.status === "signed") {
    return res.status(400).json({ error: "Eintrag ist bereits signiert." });
  }

  if (entry.status !== "submitted") {
    return res.status(400).json({ error: "Nur eingereichte Eintraege koennen signiert werden." });
  }

  db.prepare(`
    UPDATE entries
    SET status = 'signed', signedAt = ?, signerName = ?, trainerComment = ?, rejectionReason = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'submitted'
  `).run(new Date().toISOString(), req.user.name, trainerComment, entryId);

  res.json({ ok: true });
});

app.post("/api/trainer/comment", requireRole("trainer", "admin"), (req, res) => {
  const entryId = String(req.body?.entryId || "");
  const comment = String(req.body?.comment || "").trim();
  if (!comment) {
    return res.status(400).json({ error: "Kommentar fehlt." });
  }

  const entry = db.prepare(`
    SELECT entries.id, entries.status, entries.trainee_id
    FROM entries
    WHERE entries.id = ?
  `).get(entryId);

  if (!entry) {
    return res.status(404).json({ error: "Eintrag nicht gefunden." });
  }

  if (req.user.role === "trainer" && !isTrainerAssignedToTrainee(req.user.id, entry.trainee_id)) {
    return res.status(403).json({ error: "Eintrag gehoert nicht zu dir." });
  }

  if (entry.status === "signed") {
    return res.status(400).json({ error: "Signierte Eintraege koennen nicht kommentiert werden." });
  }

  db.prepare(`
    UPDATE entries
    SET status = 'rejected', trainerComment = ?, rejectionReason = ?, signedAt = NULL, signerName = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status != 'signed'
  `).run(comment, comment, entryId);

  res.json({ ok: true });
});

app.post("/api/trainer/reject", requireRole("trainer", "admin"), (req, res) => {
  const entryId = String(req.body?.entryId || "");
  const reason = String(req.body?.reason || "").trim();
  if (!reason) {
    return res.status(400).json({ error: "Ablehnungsgrund fehlt." });
  }

  const entry = db.prepare(`
    SELECT entries.id, entries.trainee_id, entries.status
    FROM entries
    WHERE entries.id = ?
  `).get(entryId);

  if (!entry) {
    return res.status(404).json({ error: "Eintrag nicht gefunden." });
  }

  if (req.user.role === "trainer" && !isTrainerAssignedToTrainee(req.user.id, entry.trainee_id)) {
    return res.status(403).json({ error: "Eintrag gehoert nicht zu dir." });
  }

  if (entry.status === "signed") {
    return res.status(400).json({ error: "Signierte Eintraege koennen nicht abgelehnt werden." });
  }

  db.prepare(`
    UPDATE entries
    SET status = 'rejected', signedAt = NULL, signerName = '', rejectionReason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status != 'signed'
  `).run(reason, entryId);

  res.json({ ok: true });
});

app.post("/api/admin/users", requireRole("admin"), (req, res) => {
  const result = validateAdminUserPayload(req.body || {}, { requirePassword: true });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const { name, username, email, password, role, ausbildung, betrieb, berufsschule, trainerIds } = result.data;
  const matchingTrainerCount = trainerIds.length
    ? db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'trainer' AND id IN (${trainerIds.map(() => "?").join(", ")})`).get(...trainerIds).count
    : 0;
  if (matchingTrainerCount !== trainerIds.length) {
    return res.status(400).json({ error: "Mindestens ein ausgewaehlter Ausbilder wurde nicht gefunden." });
  }

  try {
    const insertResult = db.prepare(`
      INSERT INTO users (name, username, email, password_hash, role, trainer_id, ausbildung, betrieb, berufsschule)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(name, username, email, hashPassword(password), role, ausbildung, betrieb, berufsschule);
    saveEducation(ausbildung);
    if (role === "trainee") {
      syncTraineeTrainerAssignments(insertResult.lastInsertRowid, trainerIds);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Benutzer konnte nicht angelegt werden. Benutzername oder E-Mail existiert bereits." });
  }
});

app.post("/api/admin/assign-trainer", requireRole("admin"), (req, res) => {
  const traineeId = Number(req.body?.traineeId);
  const trainerIds = parseTrainerIds(req.body?.trainerIds);

  if (!Number.isInteger(traineeId)) {
    return res.status(400).json({ error: "Ungueltiger Azubi." });
  }

  const trainee = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'trainee'").get(traineeId);
  if (!trainee) {
    return res.status(404).json({ error: "Azubi nicht gefunden." });
  }

  const matchingTrainerCount = trainerIds.length
    ? db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'trainer' AND id IN (${trainerIds.map(() => "?").join(", ")})`).get(...trainerIds).count
    : 0;
  if (matchingTrainerCount !== trainerIds.length) {
    return res.status(400).json({ error: "Mindestens ein ausgewaehlter Ausbilder wurde nicht gefunden." });
  }

  syncTraineeTrainerAssignments(traineeId, trainerIds);
  res.json({ ok: true });
});

app.post("/api/admin/users/:id", requireRole("admin"), (req, res) => {
  const userId = Number(req.params.id);
  const result = validateAdminUserPayload(req.body || {});
  if (!Number.isInteger(userId) || result.error) {
    return res.status(400).json({ error: result.error || "Ungueltige Nutzerdaten." });
  }

  const { name, username, email, role, password, ausbildung, betrieb, berufsschule, trainerIds } = result.data;
  const existingUser = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!existingUser) {
    return res.status(404).json({ error: "Benutzer nicht gefunden." });
  }

  const validTrainerIds = trainerIds.filter((trainerId) => trainerId !== userId);
  const matchingTrainerCount = validTrainerIds.length
    ? db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'trainer' AND id IN (${validTrainerIds.map(() => "?").join(", ")})`).get(...validTrainerIds).count
    : 0;
  if (matchingTrainerCount !== validTrainerIds.length) {
    return res.status(400).json({ error: "Mindestens ein ausgewaehlter Ausbilder wurde nicht gefunden." });
  }

  if (role === "trainer" && validTrainerIds.length) {
    return res.status(400).json({ error: "Ungueltige Nutzerdaten." });
  }

  try {
    if (password) {
      db.prepare(`
        UPDATE users
        SET name = ?, username = ?, email = ?, role = ?, ausbildung = ?, betrieb = ?, berufsschule = ?, trainer_id = NULL, password_hash = ?
        WHERE id = ?
      `).run(name, username, email, role, ausbildung, betrieb, berufsschule, hashPassword(password), userId);
    } else {
      db.prepare(`
        UPDATE users
        SET name = ?, username = ?, email = ?, role = ?, ausbildung = ?, betrieb = ?, berufsschule = ?, trainer_id = NULL
        WHERE id = ?
      `).run(name, username, email, role, ausbildung, betrieb, berufsschule, userId);
    }

    saveEducation(ausbildung);

    if (role === "trainee") {
      syncTraineeTrainerAssignments(userId, validTrainerIds);
    } else {
      db.prepare("DELETE FROM trainee_trainers WHERE trainee_id = ?").run(userId);
    }

    if (role !== "trainer") {
      db.prepare("DELETE FROM trainee_trainers WHERE trainer_id = ?").run(userId);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Benutzer konnte nicht aktualisiert werden. Benutzername oder E-Mail existiert bereits." });
  }
});

app.get("/api/grades", requireRole("trainee"), (req, res) => {
  res.json({ grades: listGradesForTrainee(req.user.id) });
});

app.post("/api/grades", requireRole("trainee"), (req, res) => {
  const result = validateGrade(req.body || {});
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const grade = result.data;

  if (grade.id) {
    const existing = db.prepare("SELECT id FROM grades WHERE id = ? AND trainee_id = ?").get(grade.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: "Note nicht gefunden." });
    }

    db.prepare(`
      UPDATE grades
      SET fach = ?, typ = ?, bezeichnung = ?, datum = ?, note = ?, gewicht = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND trainee_id = ?
    `).run(grade.fach, grade.typ, grade.bezeichnung, grade.datum, grade.note, grade.gewicht, grade.id, req.user.id);
  } else {
    db.prepare(`
      INSERT INTO grades (trainee_id, fach, typ, bezeichnung, datum, note, gewicht)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, grade.fach, grade.typ, grade.bezeichnung, grade.datum, grade.note, grade.gewicht);
  }

  res.json({ ok: true, grades: listGradesForTrainee(req.user.id) });
});

app.delete("/api/grades/:id", requireRole("trainee"), (req, res) => {
  const gradeId = Number(req.params.id);
  if (!Number.isInteger(gradeId)) {
    return res.status(400).json({ error: "Ungueltige Note." });
  }

  const result = db.prepare("DELETE FROM grades WHERE id = ? AND trainee_id = ?").run(gradeId, req.user.id);
  if (!result.changes) {
    return res.status(404).json({ error: "Note nicht gefunden." });
  }

  res.json({ ok: true, grades: listGradesForTrainee(req.user.id) });
});

app.get("/api/grades/pdf", requireRole("trainee"), (req, res) => {
  renderGradesPdf(res, req.user, listGradesForTrainee(req.user.id));
});

function handlePdfRequest(req, res) {
  const requestedId = req.params.traineeId ? Number(req.params.traineeId) : req.user.id;
  let traineeId = requestedId;

  if (req.user.role === "trainee") {
    traineeId = req.user.id;
  }

  const trainee = db.prepare(`
    SELECT id, name, username, email, ausbildung, betrieb, berufsschule
    FROM users
    WHERE id = ? AND role = 'trainee'
  `).get(traineeId);

  if (!trainee) {
    return res.status(404).json({ error: "Azubi nicht gefunden." });
  }

  if (req.user.role === "trainer" && !isTrainerAssignedToTrainee(req.user.id, trainee.id)) {
    return res.status(403).json({ error: "Keine Berechtigung fuer dieses Berichtsheft." });
  }

  renderPdf(res, trainee, listEntriesForTrainee(trainee.id));
}

app.get("/api/report/pdf", requireRole("trainee", "trainer", "admin"), handlePdfRequest);
app.get("/api/report/pdf/:traineeId", requireRole("trainee", "trainer", "admin"), handlePdfRequest);

app.get(/^\/(?!api(?:\/|$)|Pictures(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Berichtsheft-App laeuft auf http://localhost:${port}`);
    if (enableDemoData) {
      console.log("Demo-Logins: azubi@example.com / azubi123 | trainer@example.com / trainer123 | admin@example.com / admin123");
    }
  });
}

module.exports = { app, db };
