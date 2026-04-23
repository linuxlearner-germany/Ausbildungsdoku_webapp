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
    SESSION_SECRET: "secret",
    INITIAL_ADMIN_PASSWORD: "Password123!",
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

test("Config berechnet Session-TTL aus Cookie-Max-Age", () => {
  const config = loadConfigWithEnv({
    NODE_ENV: "development",
    SESSION_SECRET: "secret",
    INITIAL_ADMIN_PASSWORD: "Password123!",
    SESSION_MAX_AGE_MS: "120000",
    MSSQL_HOST: "db.example.test",
    MSSQL_DATABASE: "berichtsheft",
    MSSQL_USER: "sa",
    MSSQL_PASSWORD: "Password123!"
  });

  assert.equal(config.session.ttlSeconds, 120);
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
      SESSION_SECRET: "secret",
      INITIAL_ADMIN_PASSWORD: "Password123!",
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

test("SESSION_SECRET ist immer verpflichtend", () => {
  assert.throws(
    () => loadConfigWithEnv({
      NODE_ENV: "development",
      SESSION_SECRET: "",
      INITIAL_ADMIN_PASSWORD: "Password123!",
      MSSQL_HOST: "db.example.test",
      MSSQL_DATABASE: "berichtsheft",
      MSSQL_USER: "sa",
      MSSQL_PASSWORD: "Password123!"
    }),
    /SESSION_SECRET muss gesetzt sein/
  );
});

test("INITIAL_ADMIN_PASSWORD ist immer verpflichtend", () => {
  assert.throws(
    () => loadConfigWithEnv({
      NODE_ENV: "development",
      SESSION_SECRET: "secret",
      INITIAL_ADMIN_PASSWORD: "",
      MSSQL_HOST: "db.example.test",
      MSSQL_DATABASE: "berichtsheft",
      MSSQL_USER: "sa",
      MSSQL_PASSWORD: "Password123!"
    }),
    /INITIAL_ADMIN_PASSWORD muss gesetzt sein/
  );
});

test("REDIS_KEY_PREFIX muss mit Doppelpunkt enden", () => {
  assert.throws(
    () => loadConfigWithEnv({
      NODE_ENV: "development",
      SESSION_SECRET: "secret",
      INITIAL_ADMIN_PASSWORD: "Password123!",
      REDIS_KEY_PREFIX: "berichtsheft",
      MSSQL_HOST: "db.example.test",
      MSSQL_DATABASE: "berichtsheft",
      MSSQL_USER: "sa",
      MSSQL_PASSWORD: "Password123!"
    }),
    /REDIS_KEY_PREFIX muss mit ':' enden/
  );
});

test("Produktion verbietet Reset beim Start", () => {
  assert.throws(
    () => loadConfigWithEnv({
      NODE_ENV: "production",
      SESSION_SECRET: "secret",
      SESSION_SECURE: "true",
      INITIAL_ADMIN_PASSWORD: "Password123!",
      RESET_DATABASE_ON_START: "true",
      MSSQL_HOST: "db.example.test",
      MSSQL_DATABASE: "berichtsheft",
      MSSQL_USER: "sa",
      MSSQL_PASSWORD: "Password123!"
    }),
    /RESET_DATABASE_ON_START darf in Produktion nicht aktiviert sein/
  );
});
