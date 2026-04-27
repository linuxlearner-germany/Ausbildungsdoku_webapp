import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runNodeScript } from "../helpers/test-server.mjs";
import { buildIntegrationTestEnv } from "../helpers/test-env.mjs";

const require = createRequire(import.meta.url);
const { createConfig } = require("../../app/config");
const { createDb } = require("../../app/create-db");
const { hashPassword } = require("../../app/runtime-helpers");
const { createBootstrap } = require("../../data/bootstrap-mssql");

function createTestDb(envOverrides = {}) {
  const config = createConfig({ env: buildIntegrationTestEnv(envOverrides) });
  return {
    config,
    db: createDb(config)
  };
}

await test("admin:reset erstellt Admin, wenn keiner existiert", async () => {
  const { config, db } = createTestDb();

  try {
    const bootstrap = createBootstrap({ db, config, hashPassword });
    await bootstrap.run({ reset: true });
    await db("users").where({ role: "admin" }).del();

    const result = await runNodeScript("scripts/admin-reset.mjs", {
      MSSQL_DATABASE: config.mssql.database,
      MSSQL_TEST_DATABASE: config.mssql.database
    });

    assert.equal(result.exitCode, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.action, "created_initial_admin");

    const admin = await db("users").where({ username: config.initialAdmin.username }).first("username", "email", "role");
    assert.equal(admin.username, config.initialAdmin.username);
    assert.equal(admin.email, config.initialAdmin.email);
    assert.equal(admin.role, "admin");
  } finally {
    await db.destroy();
  }
});

await test("admin:reset setzt Passwort fuer vorhandenen Admin zurueck", async () => {
  const { config, db } = createTestDb();

  try {
    const bootstrap = createBootstrap({ db, config, hashPassword });
    await bootstrap.run({ reset: true });
    await db("users")
      .where({ username: config.initialAdmin.username })
      .update({ password_hash: hashPassword("falsches-passwort-123!") });

    const beforeUserCount = await db("users").count("* as count").first();
    const beforeEntryCount = await db("entries").count("* as count").first();
    const result = await runNodeScript("scripts/admin-reset.mjs", {
      MSSQL_DATABASE: config.mssql.database,
      MSSQL_TEST_DATABASE: config.mssql.database
    });

    assert.equal(result.exitCode, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.action, "reset_existing_admin_password");

    const admin = await db("users")
      .where({ username: config.initialAdmin.username })
      .first("password_hash");
    const bcrypt = require("bcryptjs");
    assert.equal(bcrypt.compareSync(config.initialAdmin.password, admin.password_hash), true);

    const afterUserCount = await db("users").count("* as count").first();
    const afterEntryCount = await db("entries").count("* as count").first();
    assert.equal(Number(afterUserCount.count), Number(beforeUserCount.count));
    assert.equal(Number(afterEntryCount.count), Number(beforeEntryCount.count));
  } finally {
    await db.destroy();
  }
});
