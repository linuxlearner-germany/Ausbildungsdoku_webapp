import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConfig } = require("../app/config");
const { createDb, verifyDbConnection } = require("../app/create-db");
const { createBootstrap } = require("../data/bootstrap-mssql");
const { runMigrations } = require("../app/run-migrations");
const { hashPassword } = require("../app/runtime-helpers");

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const config = createConfig();
const db = createDb(config);

try {
  await verifyDbConnection(db);
  await runMigrations({ db });
  const bootstrap = createBootstrap({ db, config, hashPassword });
  await bootstrap.run({ reset: true });
  console.log("Testdatenbank erfolgreich zurueckgesetzt.");
} finally {
  await db.destroy();
}
