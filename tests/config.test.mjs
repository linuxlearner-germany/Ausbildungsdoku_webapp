import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const configModulePath = require.resolve("../app/config");

function loadConfigWithEnv(env) {
  const previousEnv = { ...process.env };
  Object.keys(process.env).forEach((key) => delete process.env[key]);
  Object.assign(process.env, env);
  delete require.cache[configModulePath];

  try {
    const { createConfig } = require("../app/config");
    return createConfig();
  } finally {
    Object.keys(process.env).forEach((key) => delete process.env[key]);
    Object.assign(process.env, previousEnv);
    delete require.cache[configModulePath];
  }
}

test("Config baut Redis-URL aus Host/Port/Passwort", () => {
  const config = loadConfigWithEnv({
    NODE_ENV: "development",
    MSSQL_HOST: "db.example.test",
    MSSQL_DATABASE: "berichtsheft",
    MSSQL_USER: "sa",
    MSSQL_PASSWORD: "Password123!",
    REDIS_HOST: "redis.internal",
    REDIS_PORT: "6380",
    REDIS_PASSWORD: "secret"
  });

  assert.equal(config.redis.url, "redis://:secret@redis.internal:6380");
});

test("Produktion verbietet Demo-Daten", () => {
  assert.throws(
    () => loadConfigWithEnv({
      NODE_ENV: "production",
      SESSION_SECRET: "secret",
      INITIAL_ADMIN_PASSWORD: "Password123!",
      ENABLE_DEMO_DATA: "true",
      MSSQL_HOST: "db.example.test",
      MSSQL_DATABASE: "berichtsheft",
      MSSQL_USER: "sa",
      MSSQL_PASSWORD: "Password123!"
    }),
    /ENABLE_DEMO_DATA darf in Produktion nicht aktiviert sein/
  );
});

test("SameSite none erfordert secure cookies", () => {
  assert.throws(
    () => loadConfigWithEnv({
      NODE_ENV: "development",
      SESSION_SAME_SITE: "none",
      SESSION_SECURE: "false",
      MSSQL_HOST: "db.example.test",
      MSSQL_DATABASE: "berichtsheft",
      MSSQL_USER: "sa",
      MSSQL_PASSWORD: "Password123!"
    }),
    /SESSION_SAME_SITE=none erfordert SESSION_SECURE=true/
  );
});
