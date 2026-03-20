const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const PDFDocument = require("pdfkit");

const app = express();
const port = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
const dbFile = path.join(dataDir, "berichtsheft.db");
const legacyFile = path.join(dataDir, "berichtsheft.json");

function ensureStorage() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

ensureStorage();

const db = new Database(dbFile);

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
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

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
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
  const hasUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0;
  if (hasUsers) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, ausbildung, betrieb, berufsschule, trainer_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const trainer = insert.run(
    "Herr Ausbilder",
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
migrateEntrySchema();
ensureDemoUsers();
migrateLegacyJson();
ensureDemoData();

const defaultTrainee = db.prepare("SELECT id FROM users WHERE role = 'trainee' ORDER BY id ASC LIMIT 1").get();
if (defaultTrainee) {
  db.prepare("UPDATE entries SET trainee_id = ? WHERE trainee_id IS NULL").run(defaultTrainee.id);
}

app.use(express.json({ limit: "15mb" }));
app.use("/Pictures", express.static(path.join(__dirname, "Pictures")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "berichtsheft-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
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

function getCurrentUser(req) {
  if (!req.session.userId) {
    return null;
  }

  const user = db.prepare(`
    SELECT id, name, email, role, ausbildung, betrieb, berufsschule, trainer_id
    FROM users
    WHERE id = ?
  `).get(req.session.userId);

  return user || null;
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
  const trainees = db.prepare(`
    SELECT id, name, email, ausbildung, betrieb, berufsschule
    FROM users
    WHERE role = 'trainee' AND trainer_id = ?
    ORDER BY name ASC
  `).all(user.id);

  return trainees.map((trainee) => ({
    ...trainee,
    entries: listEntriesForTrainee(trainee.id)
  }));
}

function upsertTraineeEntries(user, payload) {
  const trainee = {
    name: String(payload.trainee?.name || "").trim(),
    ausbildung: String(payload.trainee?.ausbildung || "").trim(),
    betrieb: String(payload.trainee?.betrieb || "").trim(),
    berufsschule: String(payload.trainee?.berufsschule || "").trim()
  };
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
        return { error: "Signierte Eintraege koennen nicht bearbeitet oder geloescht werden." };
      }

      if (contentChanged) {
        entry.status = "draft";
        entry.signedAt = null;
        entry.signerName = "";
        entry.trainerComment = "";
        entry.rejectionReason = "";
      }
    }
  }

  const signedIds = Array.from(existingEntries.values())
    .filter((entry) => entry.status === "signed")
    .map((entry) => entry.id);
  const incomingIds = new Set(entries.map((entry) => entry.id));
  if (signedIds.some((id) => !incomingIds.has(id))) {
    return { error: "Signierte Eintraege koennen nicht geloescht werden." };
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET name = ?, ausbildung = ?, betrieb = ?, berufsschule = ?
      WHERE id = ?
    `).run(trainee.name, trainee.ausbildung, trainee.betrieb, trainee.berufsschule, user.id);

    const deleteEntry = db.prepare("DELETE FROM entries WHERE id = ? AND trainee_id = ? AND status != 'signed'");
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

    const incomingIds = new Set(entries.map((entry) => entry.id));
    for (const existing of existingEntries.values()) {
      if (!incomingIds.has(existing.id) && existing.status !== "signed") {
        deleteEntry.run(existing.id, user.id);
      }
    }

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
    renderHeader(`KW ${group.week}/${group.year}`, `${firstDate} bis ${lastDate}`);

    let cursorY = 245;

    group.entries.forEach((entry) => {
      const boxTop = cursorY;
      const boxHeight = 96;
      const title = `${formatDate(entry.dateFrom)} · ${entry.weekLabel || "Ohne Titel"}`;
      const statusText = entry.status === "signed" ? `Signiert von ${entry.signerName || "-"} am ${formatDateTime(entry.signedAt)}` : `Status: ${entry.status}`;
      const description = entry.betrieb || entry.schule || "-";

      doc.roundedRect(50, boxTop, 495, boxHeight, 10).fillAndStroke("#F7FAF8", "#D7E1DB");
      doc.fillColor("#11211F").font("Helvetica-Bold").fontSize(11).text(title, 62, boxTop + 12, { width: 470 });
      doc.font("Helvetica").fontSize(10).fillColor("#334643").text(statusText, 62, boxTop + 30, { width: 470 });
      doc.font("Helvetica").fontSize(10).fillColor("#11211F").text(description, 62, boxTop + 46, { width: 470, height: 34, ellipsis: true });
      if (entry.rejectionReason) {
        doc.font("Helvetica").fontSize(9).fillColor("#5D6F6A").text(`Ablehnung: ${entry.rejectionReason}`, 62, boxTop + 74, { width: 470, ellipsis: true });
      }

      cursorY += boxHeight + 12;
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

app.post("/api/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
  }

  req.session.userId = user.id;
  res.json({ ok: true, user: withoutPassword(user) });
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

  const users = db.prepare(`
    SELECT id, name, email, role, ausbildung, betrieb, berufsschule, trainer_id
    FROM users
    ORDER BY role, name
  `).all();
  res.json({ role: "admin", users });
});

app.post("/api/report", requireRole("trainee"), (req, res) => {
  const result = upsertTraineeEntries(req.user, req.body || {});
  if (result?.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ ok: true, data: getTraineeDashboard(getCurrentUser(req)) });
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
    SELECT entries.id, entries.trainee_id, users.trainer_id, entries.status, entries.weekLabel, entries.dateFrom, entries.dateTo,
           entries.betrieb, entries.schule
    FROM entries
    JOIN users ON users.id = entries.trainee_id
    WHERE entries.id = ?
  `).get(entryId);

  if (!entry) {
    return res.status(404).json({ error: "Eintrag nicht gefunden." });
  }

  if (req.user.role === "trainer" && entry.trainer_id !== req.user.id) {
    return res.status(403).json({ error: "Eintrag gehoert nicht zu dir." });
  }

  const missing = validateEntry(entry);
  if (missing.length) {
    return res.status(400).json({ error: `Eintrag ist unvollstaendig: ${missing.join(", ")}` });
  }

  if (entry.status === "signed") {
    return res.status(400).json({ error: "Eintrag ist bereits signiert." });
  }

  db.prepare(`
    UPDATE entries
    SET status = 'signed', signedAt = ?, signerName = ?, trainerComment = ?, rejectionReason = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status != 'signed'
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
    SELECT entries.id, entries.status, users.trainer_id
    FROM entries
    JOIN users ON users.id = entries.trainee_id
    WHERE entries.id = ?
  `).get(entryId);

  if (!entry) {
    return res.status(404).json({ error: "Eintrag nicht gefunden." });
  }

  if (req.user.role === "trainer" && entry.trainer_id !== req.user.id) {
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
    SELECT entries.id, entries.trainee_id, entries.status, users.trainer_id
    FROM entries
    JOIN users ON users.id = entries.trainee_id
    WHERE entries.id = ?
  `).get(entryId);

  if (!entry) {
    return res.status(404).json({ error: "Eintrag nicht gefunden." });
  }

  if (req.user.role === "trainer" && entry.trainer_id !== req.user.id) {
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
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "").trim();
  const trainerId = req.body?.trainerId ? Number(req.body.trainerId) : null;

  if (!name || !email || !password || !["trainee", "trainer", "admin"].includes(role)) {
    return res.status(400).json({ error: "Ungueltige Nutzerdaten." });
  }

  if (role === "trainee" && trainerId) {
    const trainer = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'trainer'").get(trainerId);
    if (!trainer) {
      return res.status(400).json({ error: "Ausbilder nicht gefunden." });
    }
  }

  try {
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, trainer_id, ausbildung, betrieb, berufsschule)
      VALUES (?, ?, ?, ?, ?, '', '', '')
    `).run(name, email, hashPassword(password), role, role === "trainee" ? trainerId : null);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Benutzer konnte nicht angelegt werden." });
  }
});

app.post("/api/admin/assign-trainer", requireRole("admin"), (req, res) => {
  const traineeId = Number(req.body?.traineeId);
  const trainerId = req.body?.trainerId ? Number(req.body.trainerId) : null;

  if (!Number.isInteger(traineeId)) {
    return res.status(400).json({ error: "Ungueltiger Azubi." });
  }

  const trainee = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'trainee'").get(traineeId);
  if (!trainee) {
    return res.status(404).json({ error: "Azubi nicht gefunden." });
  }

  if (trainerId !== null) {
    const trainer = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'trainer'").get(trainerId);
    if (!trainer) {
      return res.status(400).json({ error: "Ausbilder nicht gefunden." });
    }
  }

  db.prepare("UPDATE users SET trainer_id = ? WHERE id = ?").run(trainerId, traineeId);
  res.json({ ok: true });
});

app.post("/api/admin/users/:id", requireRole("admin"), (req, res) => {
  const userId = Number(req.params.id);
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const role = String(req.body?.role || "").trim();
  const password = String(req.body?.password || "");
  const trainerId = req.body?.trainerId ? Number(req.body.trainerId) : null;

  if (!Number.isInteger(userId) || !name || !email || !["trainee", "trainer", "admin"].includes(role)) {
    return res.status(400).json({ error: "Ungueltige Nutzerdaten." });
  }

  const existingUser = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
  if (!existingUser) {
    return res.status(404).json({ error: "Benutzer nicht gefunden." });
  }

  if (role === "trainee" && trainerId) {
    const trainer = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'trainer'").get(trainerId);
    if (!trainer) {
      return res.status(400).json({ error: "Ausbilder nicht gefunden." });
    }
  }

  try {
    if (password) {
      db.prepare(`
        UPDATE users
        SET name = ?, email = ?, role = ?, trainer_id = ?, password_hash = ?
        WHERE id = ?
      `).run(name, email, role, role === "trainee" ? trainerId : null, hashPassword(password), userId);
    } else {
      db.prepare(`
        UPDATE users
        SET name = ?, email = ?, role = ?, trainer_id = ?
        WHERE id = ?
      `).run(name, email, role, role === "trainee" ? trainerId : null, userId);
    }

    if (role !== "trainer") {
      db.prepare("UPDATE users SET trainer_id = NULL WHERE trainer_id = ?").run(userId);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: "Benutzer konnte nicht aktualisiert werden." });
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
    SELECT id, name, email, ausbildung, betrieb, berufsschule, trainer_id
    FROM users
    WHERE id = ? AND role = 'trainee'
  `).get(traineeId);

  if (!trainee) {
    return res.status(404).json({ error: "Azubi nicht gefunden." });
  }

  if (req.user.role === "trainer" && trainee.trainer_id !== req.user.id) {
    return res.status(403).json({ error: "Keine Berechtigung fuer dieses Berichtsheft." });
  }

  renderPdf(res, trainee, listEntriesForTrainee(trainee.id));
}

app.get("/api/report/pdf", requireRole("trainee", "trainer", "admin"), handlePdfRequest);
app.get("/api/report/pdf/:traineeId", requireRole("trainee", "trainer", "admin"), handlePdfRequest);

app.get(/^\/(?!api(?:\/|$)|Pictures(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Berichtsheft-App laeuft auf http://localhost:${port}`);
  console.log("Demo-Logins: azubi@example.com / azubi123 | trainer@example.com / trainer123 | admin@example.com / admin123");
});
