import dotenv from "dotenv";

dotenv.config({ quiet: true });

export function buildIntegrationTestEnv(overrides = {}) {
  const redisPassword = process.env.REDIS_PASSWORD || "";
  const redisUrl = process.env.REDIS_URL || (redisPassword
    ? `redis://:${encodeURIComponent(redisPassword)}@127.0.0.1:6379`
    : "redis://127.0.0.1:6379");

  return {
    ...process.env,
    HOST: "127.0.0.1",
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    SESSION_SECRET: "test-session-secret",
    SESSION_COOKIE_NAME: "berichtsheft.sid",
    SESSION_SECURE: "false",
    SESSION_SAME_SITE: "lax",
    SESSION_MAX_AGE_MS: "86400000",
    SESSION_TTL_SECONDS: "86400",
    INITIAL_ADMIN_USERNAME: "admin",
    INITIAL_ADMIN_EMAIL: "admin@example.com",
    INITIAL_ADMIN_PASSWORD: "admin123",
    INITIAL_ADMIN_FORCE_PASSWORD_CHANGE: "false",
    REPORTING_PROGRESS_TODAY: "2026-04-26T10:00:00",
    ENABLE_DEMO_DATA: "true",
    APPLY_MIGRATIONS_ON_START: "true",
    BOOTSTRAP_DATABASE_ON_START: "true",
    RESET_DATABASE_ON_START: "true",
    MSSQL_HOST: process.env.MSSQL_HOST || "127.0.0.1",
    MSSQL_PORT: process.env.MSSQL_PORT || "1433",
    MSSQL_DATABASE: process.env.MSSQL_TEST_DATABASE || process.env.MSSQL_DATABASE || "ausbildungsdoku_test",
    DB_USER: process.env.DB_USER || "ausbildungsdoku_app",
    DB_PASSWORD: process.env.DB_PASSWORD || "ChangeMeDbPassword123!",
    MSSQL_PASSWORD: process.env.MSSQL_PASSWORD || "YourStrong(!)Password",
    MSSQL_TRUST_SERVER_CERTIFICATE: process.env.MSSQL_TRUST_SERVER_CERTIFICATE || "true",
    REDIS_URL: redisUrl,
    REDIS_PASSWORD: redisPassword,
    REDIS_KEY_PREFIX: "berichtsheft:test:",
    REDIS_MAX_RETRIES: "1",
    REDIS_CONNECT_TIMEOUT_MS: "2000",
    REDIS_COMMAND_TIMEOUT_MS: "2000",
    ...overrides
  };
}
