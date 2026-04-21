const path = require("path");
require("dotenv").config();

function readStringEnv(value, defaultValue = "") {
  const normalized = String(value ?? defaultValue).trim();
  return normalized || defaultValue;
}

function readBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function readNumberEnv(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readTrustProxy(value) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase())) {
    return 1;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : false;
}

function normalizeBasePath(value) {
  const normalized = readStringEnv(value, "");
  if (!normalized || normalized === "/") {
    return "";
  }

  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function normalizeSameSite(value, defaultValue = "lax") {
  const normalized = readStringEnv(value, defaultValue).toLowerCase();
  return ["lax", "strict", "none"].includes(normalized) ? normalized : defaultValue;
}

function requireEnv(name, value, { allowInTest = false } = {}) {
  if (value || (allowInTest && process.env.NODE_ENV === "test")) {
    return value;
  }

  throw new Error(`${name} muss gesetzt sein.`);
}

function assertAbsoluteUrl(name, value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.toString().replace(/\/$/, "");
  } catch (_error) {
    throw new Error(`${name} muss eine gueltige absolute URL sein.`);
  }
}

function buildRedisUrl({ url, host, port, password }) {
  if (url) {
    return url;
  }

  const auth = password ? `:${encodeURIComponent(password)}@` : "";
  return `redis://${auth}${host}:${port}`;
}

function createConfig() {
  const projectRoot = path.resolve(__dirname, "..");
  const publicDir = path.join(projectRoot, "public");
  const picturesDir = path.join(projectRoot, "Pictures");
  const nodeEnv = readStringEnv(process.env.NODE_ENV, "development");
  const isProduction = nodeEnv === "production";
  const isTest = nodeEnv === "test";
  const host = readStringEnv(process.env.HOST, "0.0.0.0");
  const port = readNumberEnv(process.env.PORT, 3010);
  const appBasePath = normalizeBasePath(process.env.APP_BASE_PATH);
  const appBaseUrl = assertAbsoluteUrl("APP_BASE_URL", readStringEnv(process.env.APP_BASE_URL, ""));
  const apiBaseUrl = assertAbsoluteUrl("API_BASE_URL", readStringEnv(process.env.API_BASE_URL, ""));
  const useRedisSessions = readBooleanEnv(process.env.USE_REDIS_SESSIONS, true);
  const redisHost = readStringEnv(process.env.REDIS_HOST, "127.0.0.1");
  const redisPort = readNumberEnv(process.env.REDIS_PORT, 6379);
  const redisPassword = readStringEnv(process.env.REDIS_PASSWORD, "");

  const defaultSessionSecret = !isProduction ? "development-session-secret" : "";
  const defaultInitialAdminPassword = !isProduction ? "AdminInit123!" : "";

  const config = {
    projectRoot,
    publicDir,
    picturesDir,
    nodeEnv,
    isProduction,
    isTest,
    app: {
      host,
      port,
      basePath: appBasePath,
      baseUrl: appBaseUrl,
      apiBaseUrl: apiBaseUrl || `${appBasePath || ""}/api`,
      publicBaseUrl: appBaseUrl ? `${appBaseUrl}${appBasePath}` : "",
      logLevel: readStringEnv(process.env.LOG_LEVEL, isProduction ? "info" : "debug")
    },
    server: {
      host,
      port,
      trustProxy: readTrustProxy(process.env.TRUST_PROXY)
    },
    bootstrap: {
      applyMigrationsOnStart: readBooleanEnv(process.env.APPLY_MIGRATIONS_ON_START, true),
      bootstrapDatabaseOnStart: readBooleanEnv(process.env.BOOTSTRAP_DATABASE_ON_START, true),
      resetDatabaseOnStart: readBooleanEnv(process.env.RESET_DATABASE_ON_START, false),
      enableDemoData: readBooleanEnv(process.env.ENABLE_DEMO_DATA, false)
    },
    session: {
      secret: requireEnv("SESSION_SECRET", process.env.SESSION_SECRET || defaultSessionSecret, { allowInTest: true }),
      cookieName: readStringEnv(process.env.SESSION_COOKIE_NAME, "berichtsheft.sid"),
      secure: readBooleanEnv(process.env.SESSION_SECURE, isProduction),
      sameSite: normalizeSameSite(process.env.SESSION_SAME_SITE, "lax"),
      maxAgeMs: readNumberEnv(process.env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 8),
      useRedisSessions
    },
    redis: {
      useSessions: useRedisSessions,
      url: buildRedisUrl({
        url: readStringEnv(process.env.REDIS_URL, ""),
        host: redisHost,
        port: redisPort,
        password: redisPassword
      }),
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      keyPrefix: readStringEnv(process.env.REDIS_KEY_PREFIX, "berichtsheft:")
    },
    mssql: {
      host: readStringEnv(process.env.MSSQL_HOST, "localhost"),
      port: readNumberEnv(process.env.MSSQL_PORT, 1433),
      database: requireEnv("MSSQL_DATABASE", readStringEnv(process.env.MSSQL_DATABASE, "")),
      user: requireEnv("MSSQL_USER", readStringEnv(process.env.MSSQL_USER, "")),
      password: requireEnv("MSSQL_PASSWORD", process.env.MSSQL_PASSWORD),
      encrypt: readBooleanEnv(process.env.MSSQL_ENCRYPT, true),
      trustServerCertificate: readBooleanEnv(process.env.MSSQL_TRUST_SERVER_CERTIFICATE, true),
      poolMin: readNumberEnv(process.env.MSSQL_POOL_MIN, 0),
      poolMax: readNumberEnv(process.env.MSSQL_POOL_MAX, 10),
      connectionTimeoutMs: readNumberEnv(process.env.MSSQL_CONNECTION_TIMEOUT_MS, 15000),
      requestTimeoutMs: readNumberEnv(process.env.MSSQL_REQUEST_TIMEOUT_MS, 15000)
    },
    initialAdmin: {
      username: readStringEnv(process.env.INITIAL_ADMIN_USERNAME, "admin"),
      email: readStringEnv(process.env.INITIAL_ADMIN_EMAIL, "admin@example.com").toLowerCase(),
      password: requireEnv("INITIAL_ADMIN_PASSWORD", process.env.INITIAL_ADMIN_PASSWORD || defaultInitialAdminPassword, { allowInTest: true })
    }
  };

  if (config.isProduction && config.bootstrap.enableDemoData) {
    throw new Error("ENABLE_DEMO_DATA darf in Produktion nicht aktiviert sein.");
  }

  if (config.isProduction && !config.session.useRedisSessions) {
    throw new Error("USE_REDIS_SESSIONS darf in Produktion nicht deaktiviert sein.");
  }

  if (config.session.sameSite === "none" && !config.session.secure) {
    throw new Error("SESSION_SAME_SITE=none erfordert SESSION_SECURE=true.");
  }

  return config;
}

module.exports = {
  createConfig,
  readBooleanEnv,
  normalizeBasePath
};
