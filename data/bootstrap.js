const fs = require("fs");

function createBootstrap({
  dataDir,
  legacyFile,
  db,
  enableDemoData,
  isProduction,
  initialAdminUsername,
  initialAdminEmail,
  initialAdminPassword,
  hashPassword,
  normalizeUsername,
  normalizeEntry,
  parseImportedDate,
  toIsoDateParts
}) {
  function ensureStorage() {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
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

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actor_user_id INTEGER,
        actor_name TEXT NOT NULL DEFAULT '',
        actor_role TEXT NOT NULL DEFAULT '',
        action_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL DEFAULT '',
        target_user_id INTEGER,
        summary TEXT NOT NULL DEFAULT '',
        changes_json TEXT,
        metadata_json TEXT,
        FOREIGN KEY(actor_user_id) REFERENCES users(id),
        FOREIGN KEY(target_user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON audit_logs(target_user_id);
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

  function ensureInitialAdmin() {
    const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    if (userCount > 0) {
      return null;
    }

    if (isProduction && !initialAdminPassword) {
      throw new Error("Leere Datenbank ohne INITIAL_ADMIN_PASSWORD ist in Produktion nicht erlaubt.");
    }

    const username = normalizeUsername(initialAdminUsername) || "admin";
    const email = String(initialAdminEmail || "admin@example.com").trim().toLowerCase() || "admin@example.com";
    const password = String(initialAdminPassword || "admin123");

    db.prepare(`
      INSERT INTO users (name, username, email, password_hash, role, ausbildung, betrieb, berufsschule, trainer_id)
      VALUES (?, ?, ?, ?, 'admin', '', '', '', NULL)
    `).run(
      "Administrator",
      username,
      email,
      hashPassword(password)
    );

    return {
      username,
      email,
      password
    };
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
    } catch (_error) {
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
      ["demo-entry-2026-03-16", "Einrichtung Arbeitsplatz", "2026-03-16", "Notebook eingerichtet, Benutzerkonto angelegt und interne Tools installiert.", "", "signed", "2026-03-17T08:15:00.000Z", "Herr Ausbilder", "", ""],
      ["demo-entry-2026-03-17", "Einweisung Ticketsystem", "2026-03-17", "Erste Supportfaelle im Ticketsystem analysiert und dokumentiert.", "", "signed", "2026-03-18T08:10:00.000Z", "Herr Ausbilder", "", ""],
      ["demo-entry-2026-03-18", "Netzwerkgrundlagen", "2026-03-18", "", "OSI-Modell, IPv4-Adressierung und Subnetting in der Berufsschule behandelt.", "signed", "2026-03-19T08:05:00.000Z", "Herr Ausbilder", "", ""],
      ["demo-entry-2026-03-19", "Dokumentation Wissensbasis", "2026-03-19", "Interne Wissensartikel zu Standardstoerungen ueberarbeitet.", "", "submitted", null, "", "", ""],
      ["demo-entry-2026-03-20", "Benutzerverwaltung AD", "2026-03-20", "Benutzer in der Testumgebung angelegt und Gruppenrechte nachvollzogen.", "", "draft", null, "", "", ""],
      ["demo-entry-2026-03-23", "Grundlagen SQL", "2026-03-23", "", "SELECT, WHERE, ORDER BY und erste JOINs im Unterricht geuebt.", "signed", "2026-03-24T08:20:00.000Z", "Herr Ausbilder", "", ""],
      ["demo-entry-2026-03-24", "Inventarisierung Hardware", "2026-03-24", "Neue Geraete in die Inventarliste aufgenommen und Seriennummern geprueft.", "", "signed", "2026-03-25T08:10:00.000Z", "Herr Ausbilder", "", ""],
      ["demo-entry-2026-03-25", "Rueckfrage zum Bericht", "2026-03-25", "Vorgangsbeschreibung war zu kurz und wurde vom Ausbilder zur Korrektur markiert.", "", "rejected", null, "", "Bitte den Arbeitsablauf genauer beschreiben.", "Bitte den Arbeitsablauf genauer beschreiben."]
    ];

    demoEntries.forEach((entry) => {
      const exists = db.prepare("SELECT 1 FROM entries WHERE trainee_id = ? AND (id = ? OR dateFrom = ?)").get(trainee.id, entry[0], entry[2]);
      if (exists) {
        return;
      }

      insertEntry.run(entry[0], trainee.id, entry[1], entry[2], entry[2], entry[3], entry[4], entry[5], entry[6], entry[7], entry[8], entry[9]);
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
      if (!exists) {
        insertGrade.run(trainee.id, grade[0], grade[1], grade[2], grade[3], grade[4], grade[5]);
      }
    });
  }

  function run() {
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
    const initialAdmin = ensureInitialAdmin();

    const defaultTrainee = db.prepare("SELECT id FROM users WHERE role = 'trainee' ORDER BY id ASC LIMIT 1").get();
    if (defaultTrainee) {
      db.prepare("UPDATE entries SET trainee_id = ? WHERE trainee_id IS NULL").run(defaultTrainee.id);
    }

    return {
      initialAdmin
    };
  }

  return {
    ensureStorage,
    run
  };
}

module.exports = {
  createBootstrap
};
