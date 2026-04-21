import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConfig } = require("../app/config");
const { createDb, verifyDbConnection } = require("../app/create-db");
const { createBootstrap } = require("../data/bootstrap-mssql");
const { hashPassword } = require("../app/runtime-helpers");

const config = createConfig();
const db = createDb(config);

try {
  await verifyDbConnection(db);
  const bootstrap = createBootstrap({ db, config, hashPassword });
  await bootstrap.run({ reset: config.bootstrap.resetDatabaseOnStart });
  console.log("Datenbank erfolgreich initialisiert.");
} finally {
  await db.destroy();
}
