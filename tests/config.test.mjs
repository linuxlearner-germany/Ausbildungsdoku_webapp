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

function baseEnv(overrides = {}) {
  return {
    NODE_ENV: "development",
    SESSION_SECRET: "secret",
    INITIAL_ADMIN_PASSWORD: "Password123!",
    REDIS_PASSWORD: "redis-secret",
    MSSQL_HOST: "db.example.test",
    MSSQL_DATABASE: "berichtsheft",
    DB_USER: "ausbildungsdoku_app",
    DB_PASSWORD: "Password123!",
    ...overrides
  };
}

test("Config baut Redis-URL aus Host/Port/Passwort", () => {
  const config = loadConfigWithEnv(baseEnv({
    REDIS_HOST: "redis.internal",
    REDIS_PORT: "6380",
    REDIS_PASSWORD: "secret"
  }));

  assert.equal(config.redis.url, "redis://:secret@redis.internal:6380");
});

test("Config berechnet Session-TTL aus Cookie-Max-Age", () => {
  const config = loadConfigWithEnv(baseEnv({
    SESSION_MAX_AGE_MS: "120000",
  }));

  assert.equal(config.session.ttlSeconds, 120);
});

test("Login-Rate-Limit nutzt produktive und lokale Defaults", () => {
  const localConfig = loadConfigWithEnv({
    ...baseEnv(),
    NODE_ENV: "development"
  });
  assert.equal(localConfig.security.loginRateLimit.windowMs, 60_000);
  assert.equal(localConfig.security.loginRateLimit.maxAttempts, 50);

  const productionConfig = loadConfigWithEnv({
    ...baseEnv(),
    NODE_ENV: "production",
    SESSION_SECURE: "true"
  });
  assert.equal(productionConfig.security.loginRateLimit.windowMs, 60_000);
  assert.equal(productionConfig.security.loginRateLimit.maxAttempts, 5);
});

test("Initialer Admin-Benutzername wird fuer Login-Vergleiche normalisiert", () => {
  const config = loadConfigWithEnv(baseEnv({
    INITIAL_ADMIN_USERNAME: "Admin",
  }));

  assert.equal(config.initialAdmin.username, "admin");
  assert.equal(config.initialAdmin.forcePasswordChange, true);
});

test("Produktion verbietet Demo-Daten", () => {
  assert.throws(
    () => loadConfigWithEnv(baseEnv({
      NODE_ENV: "production",
      ENABLE_DEMO_DATA: "true",
      SESSION_SECURE: "true"
    })),
    /ENABLE_DEMO_DATA darf in Produktion nicht aktiviert sein/
  );
});

test("Session SameSite bleibt hart auf lax", () => {
  const config = loadConfigWithEnv(baseEnv({
    SESSION_SAME_SITE: "none",
    SESSION_SECURE: "false"
  }));

  assert.equal(config.session.sameSite, "lax");
});

test("SESSION_SECRET ist immer verpflichtend", () => {
  assert.throws(
    () => loadConfigWithEnv(baseEnv({
      SESSION_SECRET: "",
    })),
    /SESSION_SECRET muss gesetzt sein/
  );
});

test("INITIAL_ADMIN_PASSWORD ist immer verpflichtend", () => {
  assert.throws(
    () => loadConfigWithEnv(baseEnv({
      INITIAL_ADMIN_PASSWORD: "",
    })),
    /INITIAL_ADMIN_PASSWORD muss gesetzt sein/
  );
});

test("DB_USER und DB_PASSWORD sind verpflichtend", () => {
  assert.throws(
    () => loadConfigWithEnv(baseEnv({ DB_USER: "" })),
    /DB_USER muss gesetzt sein/
  );
  assert.throws(
    () => loadConfigWithEnv(baseEnv({ DB_PASSWORD: "" })),
    /DB_PASSWORD muss gesetzt sein/
  );
});

test("App-DB-User darf nicht sa sein", () => {
  assert.throws(
    () => loadConfigWithEnv(baseEnv({ DB_USER: "sa" })),
    /DB_USER darf nicht 'sa' sein/
  );
});

test("REDIS_PASSWORD ist ausserhalb von Tests verpflichtend", () => {
  assert.throws(
    () => loadConfigWithEnv(baseEnv({ REDIS_PASSWORD: "" })),
    /REDIS_PASSWORD muss gesetzt sein/
  );
});

test("REDIS_KEY_PREFIX muss mit Doppelpunkt enden", () => {
  assert.throws(
    () => loadConfigWithEnv(baseEnv({
      REDIS_KEY_PREFIX: "berichtsheft",
    })),
    /REDIS_KEY_PREFIX muss mit ':' enden/
  );
});

test("Produktion verbietet Reset beim Start", () => {
  assert.throws(
    () => loadConfigWithEnv(baseEnv({
      NODE_ENV: "production",
      SESSION_SECURE: "true",
      RESET_DATABASE_ON_START: "true",
    })),
    /RESET_DATABASE_ON_START darf in Produktion nicht aktiviert sein/
  );
});
