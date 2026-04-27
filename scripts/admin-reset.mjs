import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConfig } = require("../app/config");
const { createDb, verifyDbConnection } = require("../app/create-db");
const { createBootstrap } = require("../data/bootstrap-mssql");
const { hashPassword } = require("../app/runtime-helpers");

const config = createConfig();
const db = createDb(config);

try {
  await verifyDbConnection(db, config);
  const bootstrap = createBootstrap({ db, config, hashPassword });
  const result = await bootstrap.resetInitialAdmin();

  console.log(JSON.stringify({
    ok: true,
    action: result.created ? (result.recovered ? "created_recovery_admin" : "created_initial_admin") : "reset_existing_admin_password",
    user: result.user
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
