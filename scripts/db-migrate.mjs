import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConfig } = require("../app/config");
const { createDb, verifyDbConnection } = require("../app/create-db");
const { runMigrations } = require("../app/run-migrations");

const config = createConfig();
const db = createDb(config);

try {
  await verifyDbConnection(db);
  await runMigrations({ db });
  console.log("Migrationen erfolgreich ausgefuehrt.");
} finally {
  await db.destroy();
}
