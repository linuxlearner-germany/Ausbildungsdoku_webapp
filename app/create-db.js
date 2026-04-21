const fs = require("fs");
const Database = require("better-sqlite3");

function createDb({ dbFile }) {
  fs.mkdirSync(require("path").dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

module.exports = {
  createDb
};
