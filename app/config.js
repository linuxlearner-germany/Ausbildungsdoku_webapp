const path = require("path");
const { z } = require("zod");

require("dotenv").config({ quiet: true });

const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const NODE_ENVS = ["development", "test", "production"];
const LOG_LEVELS = ["debug", "info", "warn", "error"];
const SAME_SITE_VALUES = ["lax", "strict", "none"];

function readStringEnv(value, defaultValue = "") {
  const normalized = String(value ?? defaultValue).trim();
  return normalized || defaultValue;
}

function readBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return BOOLEAN_TRUE_VALUES.has(String(value).trim().toLowerCase());
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

  const normalized = String(value).trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return 1;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : false;
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
  return SAME_SITE_VALUES.includes(normalized) ? normalized : defaultValue;
}

function requireEnv(name, value) {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    return value;
  }

  throw new Error(`${name} muss gesetzt sein.`);
}

function assertAbsoluteUrl(name, value) {
  if (!value) {
    return "";
  }

  try {
    const parsed = new URL(value);
    return parsed.toString().replace(/\/$/, "");
  } catch (_error) {
    throw new Error(`${name} muss eine gueltige absolute URL sein.`);
  }
}

function parseRedisUrl(url, fallbackPassword = "") {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const password = decodeURIComponent(parsed.password || "") || fallbackPassword;
    if (!parsed.password && password) {
      parsed.password = password;
    }
    return {
      url: parsed.toString(),
      host: parsed.hostname || "",
      port: parsed.port ? Number(parsed.port) : 6379,
      password
    };
  } catch (_error) {
    throw new Error("REDIS_URL muss eine gueltige Redis-URL sein.");
  }
}

function buildRedisUrl({ url, host, port, password }) {
  if (url) {
    return parseRedisUrl(url, password);
  }

  const auth = password ? `:${encodeURIComponent(password)}@` : "";
  return {
    url: `redis://${auth}${host}:${port}`,
    host,
    port,
    password
  };
}

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default("development"),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3010),
  APP_BASE_URL: z.string().optional().default(""),
  APP_BASE_PATH: z.string().optional().default(""),
  API_BASE_URL: z.string().optional().default(""),
  TRUST_PROXY: z.union([z.string(), z.number(), z.boolean()]).optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("debug"),
  SERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  SERVER_HEADERS_TIMEOUT_MS: z.coerce.number().int().min(2_000).max(300_000).default(35_000),
  SERVER_KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(5_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),
  REQUEST_BODY_LIMIT: z.string().trim().min(1).default("15mb"),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(86_400_000).optional(),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10_000).optional(),
  REPORTING_PROGRESS_TODAY: z.string().trim().optional().default(""),
  APPLY_MIGRATIONS_ON_START: z.union([z.string(), z.boolean()]).optional(),
  BOOTSTRAP_DATABASE_ON_START: z.union([z.string(), z.boolean()]).optional(),
  RESET_DATABASE_ON_START: z.union([z.string(), z.boolean()]).optional(),
  ENABLE_DEMO_DATA: z.union([z.string(), z.boolean()]).optional(),
  SESSION_SECRET: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().trim().min(1).default("berichtsheft.sid"),
  SESSION_COOKIE_DOMAIN: z.string().trim().optional().default(""),
  SESSION_SECURE: z.union([z.string(), z.boolean()]).optional(),
  SESSION_SAME_SITE: z.string().trim().default("lax"),
  SESSION_MAX_AGE_MS: z.coerce.number().int().min(60_000).max(604_800_000).default(86_400_000),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(604_800).optional(),
  REDIS_URL: z.string().trim().optional().default(""),
  REDIS_HOST: z.string().trim().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),
  REDIS_KEY_PREFIX: z.string().trim().min(1).default("berichtsheft:"),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(5_000),
  REDIS_MAX_RETRIES: z.coerce.number().int().min(0).max(20).default(4),
  REDIS_PING_INTERVAL_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  DB_USER: z.string().trim().optional().default(""),
  DB_PASSWORD: z.string().optional().default(""),
  MSSQL_HOST: z.string().trim().min(1),
  MSSQL_PORT: z.coerce.number().int().min(1).max(65535).default(1433),
  MSSQL_DATABASE: z.string().trim().min(1),
  MSSQL_USER: z.string().trim().optional().default(""),
  MSSQL_PASSWORD: z.string().optional().default(""),
  MSSQL_ENCRYPT: z.union([z.string(), z.boolean()]).optional(),
  MSSQL_TRUST_SERVER_CERTIFICATE: z.union([z.string(), z.boolean()]).optional(),
  MSSQL_POOL_MIN: z.coerce.number().int().min(0).max(100).default(0),
  MSSQL_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  MSSQL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),
  MSSQL_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),
  INITIAL_ADMIN_USERNAME: z.string().trim().min(1).default("admin"),
  INITIAL_ADMIN_EMAIL: z.string().trim().email().default("admin@example.com"),
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
  INITIAL_ADMIN_FORCE_PASSWORD_CHANGE: z.union([z.string(), z.boolean()]).optional()
});

function createConfig({ env = process.env } = {}) {
  const projectRoot = path.resolve(__dirname, "..");
  const publicDir = path.join(projectRoot, "public");
  const picturesDir = path.join(projectRoot, "Pictures");
  // Alle ENV-Werte werden hier einmalig normalisiert und validiert, damit der Rest der App nur noch `config` nutzt.
  const parsedEnv = envSchema.safeParse({
    NODE_ENV: readStringEnv(env.NODE_ENV, "development"),
    HOST: readStringEnv(env.HOST, "0.0.0.0"),
    PORT: readNumberEnv(env.PORT, 3010),
    APP_BASE_URL: readStringEnv(env.APP_BASE_URL, ""),
    APP_BASE_PATH: normalizeBasePath(env.APP_BASE_PATH),
    API_BASE_URL: readStringEnv(env.API_BASE_URL, ""),
    TRUST_PROXY: env.TRUST_PROXY,
    LOG_LEVEL: readStringEnv(env.LOG_LEVEL, readStringEnv(env.NODE_ENV, "development") === "production" ? "info" : "debug"),
    SERVER_REQUEST_TIMEOUT_MS: readNumberEnv(env.SERVER_REQUEST_TIMEOUT_MS, 30_000),
    SERVER_HEADERS_TIMEOUT_MS: readNumberEnv(env.SERVER_HEADERS_TIMEOUT_MS, 35_000),
    SERVER_KEEP_ALIVE_TIMEOUT_MS: readNumberEnv(env.SERVER_KEEP_ALIVE_TIMEOUT_MS, 5_000),
    SHUTDOWN_TIMEOUT_MS: readNumberEnv(env.SHUTDOWN_TIMEOUT_MS, 10_000),
    REQUEST_BODY_LIMIT: readStringEnv(env.REQUEST_BODY_LIMIT, "15mb"),
    LOGIN_RATE_LIMIT_WINDOW_MS: readNumberEnv(env.LOGIN_RATE_LIMIT_WINDOW_MS, undefined),
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: readNumberEnv(env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, undefined),
    REPORTING_PROGRESS_TODAY: readStringEnv(env.REPORTING_PROGRESS_TODAY, ""),
    APPLY_MIGRATIONS_ON_START: env.APPLY_MIGRATIONS_ON_START,
    BOOTSTRAP_DATABASE_ON_START: env.BOOTSTRAP_DATABASE_ON_START,
    RESET_DATABASE_ON_START: env.RESET_DATABASE_ON_START,
    ENABLE_DEMO_DATA: env.ENABLE_DEMO_DATA,
    SESSION_SECRET: env.SESSION_SECRET,
    SESSION_COOKIE_NAME: readStringEnv(env.SESSION_COOKIE_NAME, "berichtsheft.sid"),
    SESSION_COOKIE_DOMAIN: readStringEnv(env.SESSION_COOKIE_DOMAIN, ""),
    SESSION_SECURE: env.SESSION_SECURE,
    SESSION_SAME_SITE: normalizeSameSite(env.SESSION_SAME_SITE, "lax"),
    SESSION_MAX_AGE_MS: readNumberEnv(env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 24),
    SESSION_TTL_SECONDS: readNumberEnv(env.SESSION_TTL_SECONDS, 0) || undefined,
    REDIS_URL: readStringEnv(env.REDIS_URL, ""),
    REDIS_HOST: readStringEnv(env.REDIS_HOST, "127.0.0.1"),
    REDIS_PORT: readNumberEnv(env.REDIS_PORT, 6379),
    REDIS_PASSWORD: readStringEnv(env.REDIS_PASSWORD, ""),
    REDIS_KEY_PREFIX: readStringEnv(env.REDIS_KEY_PREFIX, "berichtsheft:"),
    REDIS_CONNECT_TIMEOUT_MS: readNumberEnv(env.REDIS_CONNECT_TIMEOUT_MS, 10_000),
    REDIS_COMMAND_TIMEOUT_MS: readNumberEnv(env.REDIS_COMMAND_TIMEOUT_MS, 5_000),
    REDIS_MAX_RETRIES: readNumberEnv(env.REDIS_MAX_RETRIES, 4),
    REDIS_PING_INTERVAL_MS: readNumberEnv(env.REDIS_PING_INTERVAL_MS, 30_000),
    DB_USER: readStringEnv(env.DB_USER, ""),
    DB_PASSWORD: env.DB_PASSWORD || "",
    MSSQL_HOST: requireEnv("MSSQL_HOST", readStringEnv(env.MSSQL_HOST, "")),
    MSSQL_PORT: readNumberEnv(env.MSSQL_PORT, 1433),
    MSSQL_DATABASE: requireEnv("MSSQL_DATABASE", readStringEnv(env.MSSQL_DATABASE, "")),
    MSSQL_USER: readStringEnv(env.MSSQL_USER, ""),
    MSSQL_PASSWORD: env.MSSQL_PASSWORD || "",
    MSSQL_ENCRYPT: env.MSSQL_ENCRYPT,
    MSSQL_TRUST_SERVER_CERTIFICATE: env.MSSQL_TRUST_SERVER_CERTIFICATE,
    MSSQL_POOL_MIN: readNumberEnv(env.MSSQL_POOL_MIN, 0),
    MSSQL_POOL_MAX: readNumberEnv(env.MSSQL_POOL_MAX, 10),
    MSSQL_CONNECTION_TIMEOUT_MS: readNumberEnv(env.MSSQL_CONNECTION_TIMEOUT_MS, 15_000),
    MSSQL_REQUEST_TIMEOUT_MS: readNumberEnv(env.MSSQL_REQUEST_TIMEOUT_MS, 15_000),
    INITIAL_ADMIN_USERNAME: readStringEnv(env.INITIAL_ADMIN_USERNAME, "admin"),
    INITIAL_ADMIN_EMAIL: readStringEnv(env.INITIAL_ADMIN_EMAIL, "admin@example.com").toLowerCase(),
    INITIAL_ADMIN_PASSWORD: env.INITIAL_ADMIN_PASSWORD,
    INITIAL_ADMIN_FORCE_PASSWORD_CHANGE: env.INITIAL_ADMIN_FORCE_PASSWORD_CHANGE
  });

  if (!parsedEnv.success) {
    const issues = parsedEnv.error.issues.map((issue) => {
      const pathLabel = issue.path.join(".") || "config";
      return `${pathLabel}: ${issue.message}`;
    });
    throw new Error(`Ungueltige Konfiguration:\n- ${issues.join("\n- ")}`);
  }

  const values = parsedEnv.data;
  const isProduction = values.NODE_ENV === "production";
  const isTest = values.NODE_ENV === "test";
  const redisConnection = buildRedisUrl({
    url: values.REDIS_URL,
    host: values.REDIS_HOST,
    port: values.REDIS_PORT,
    password: values.REDIS_PASSWORD
  });
  const appBaseUrl = assertAbsoluteUrl("APP_BASE_URL", values.APP_BASE_URL);
  const apiBaseUrl = assertAbsoluteUrl("API_BASE_URL", values.API_BASE_URL);
  const sessionSecure = readBooleanEnv(values.SESSION_SECURE, isProduction);
  const sameSite = "lax";
  const applyMigrationsOnStart = readBooleanEnv(values.APPLY_MIGRATIONS_ON_START, true);
  const bootstrapDatabaseOnStart = readBooleanEnv(values.BOOTSTRAP_DATABASE_ON_START, true);
  const resetDatabaseOnStart = readBooleanEnv(values.RESET_DATABASE_ON_START, false);
  const enableDemoData = readBooleanEnv(values.ENABLE_DEMO_DATA, false);
  const trustProxy = readTrustProxy(values.TRUST_PROXY);
  const sessionTtlSeconds = values.SESSION_TTL_SECONDS || Math.ceil(values.SESSION_MAX_AGE_MS / 1000);
  const sessionCookieDomain = readStringEnv(values.SESSION_COOKIE_DOMAIN, "");
  const loginRateLimitWindowMs = values.LOGIN_RATE_LIMIT_WINDOW_MS || 60 * 1000;
  const loginRateLimitMaxAttempts = values.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || (isProduction ? 5 : 50);
  const dbUser = values.DB_USER;
  const dbPassword = values.DB_PASSWORD;
  const reportingProgressToday = values.REPORTING_PROGRESS_TODAY
    ? new Date(values.REPORTING_PROGRESS_TODAY)
    : null;

  if (reportingProgressToday && Number.isNaN(reportingProgressToday.getTime())) {
    throw new Error("REPORTING_PROGRESS_TODAY muss ein gueltiges Datum oder ISO-Zeitstempel sein.");
  }

  const config = {
    projectRoot,
    publicDir,
    picturesDir,
    nodeEnv: values.NODE_ENV,
    isProduction,
    isTest,
    app: {
      host: values.HOST,
      port: values.PORT,
      basePath: values.APP_BASE_PATH,
      baseUrl: appBaseUrl,
      apiBaseUrl: apiBaseUrl || (appBaseUrl ? `${appBaseUrl}${values.APP_BASE_PATH}/api` : `${values.APP_BASE_PATH || ""}/api`),
      publicBaseUrl: appBaseUrl ? `${appBaseUrl}${values.APP_BASE_PATH}` : "",
      logLevel: values.LOG_LEVEL
    },
    server: {
      host: values.HOST,
      port: values.PORT,
      trustProxy,
      requestTimeoutMs: values.SERVER_REQUEST_TIMEOUT_MS,
      headersTimeoutMs: values.SERVER_HEADERS_TIMEOUT_MS,
      keepAliveTimeoutMs: values.SERVER_KEEP_ALIVE_TIMEOUT_MS,
      shutdownTimeoutMs: values.SHUTDOWN_TIMEOUT_MS,
      requestBodyLimit: values.REQUEST_BODY_LIMIT
    },
    security: {
      hstsEnabled: isProduction,
      requestBodyLimit: values.REQUEST_BODY_LIMIT,
      loginRateLimit: {
        windowMs: loginRateLimitWindowMs,
        maxAttempts: loginRateLimitMaxAttempts
      }
    },
    runtime: {
      reportingProgressToday
    },
    bootstrap: {
      applyMigrationsOnStart,
      bootstrapDatabaseOnStart,
      resetDatabaseOnStart,
      enableDemoData
    },
    session: {
      secret: requireEnv("SESSION_SECRET", values.SESSION_SECRET),
      cookieName: values.SESSION_COOKIE_NAME,
      cookieDomain: sessionCookieDomain,
      secure: sessionSecure,
      sameSite,
      maxAgeMs: values.SESSION_MAX_AGE_MS,
      ttlSeconds: sessionTtlSeconds
    },
    redis: {
      url: redisConnection.url,
      host: redisConnection.host,
      port: redisConnection.port,
      password: redisConnection.password,
      keyPrefix: values.REDIS_KEY_PREFIX,
      connectTimeoutMs: values.REDIS_CONNECT_TIMEOUT_MS,
      commandTimeoutMs: values.REDIS_COMMAND_TIMEOUT_MS,
      maxRetries: values.REDIS_MAX_RETRIES,
      pingIntervalMs: values.REDIS_PING_INTERVAL_MS
    },
    mssql: {
      host: values.MSSQL_HOST,
      port: values.MSSQL_PORT,
      database: values.MSSQL_DATABASE,
      user: requireEnv("DB_USER", dbUser),
      password: requireEnv("DB_PASSWORD", dbPassword),
      encrypt: true,
      trustServerCertificate: readBooleanEnv(values.MSSQL_TRUST_SERVER_CERTIFICATE, false),
      poolMin: values.MSSQL_POOL_MIN,
      poolMax: values.MSSQL_POOL_MAX,
      connectionTimeoutMs: values.MSSQL_CONNECTION_TIMEOUT_MS,
      requestTimeoutMs: values.MSSQL_REQUEST_TIMEOUT_MS,
      appName: "ausbildungsdoku-webapp"
    },
    initialAdmin: {
      username: values.INITIAL_ADMIN_USERNAME.toLowerCase(),
      email: values.INITIAL_ADMIN_EMAIL,
      password: requireEnv("INITIAL_ADMIN_PASSWORD", values.INITIAL_ADMIN_PASSWORD),
      forcePasswordChange: readBooleanEnv(values.INITIAL_ADMIN_FORCE_PASSWORD_CHANGE, true)
    }
  };

  if (config.server.headersTimeoutMs <= config.server.keepAliveTimeoutMs) {
    throw new Error("SERVER_HEADERS_TIMEOUT_MS muss groesser als SERVER_KEEP_ALIVE_TIMEOUT_MS sein.");
  }

  // Konsistenzregeln, die sich nicht direkt im Schema ausdrücken lassen.
  if (config.mssql.poolMin > config.mssql.poolMax) {
    throw new Error("MSSQL_POOL_MIN darf nicht groesser als MSSQL_POOL_MAX sein.");
  }

  if (!config.redis.keyPrefix.endsWith(":")) {
    throw new Error("REDIS_KEY_PREFIX muss mit ':' enden.");
  }

  if (!config.isTest && !config.redis.password) {
    throw new Error("REDIS_PASSWORD muss gesetzt sein.");
  }

  if (!config.isTest && config.mssql.user.toLowerCase() === "sa") {
    throw new Error("DB_USER darf nicht 'sa' sein.");
  }

  if (config.session.sameSite === "none" && !config.session.secure) {
    throw new Error("SESSION_SAME_SITE=none erfordert SESSION_SECURE=true.");
  }

  if (config.isProduction && config.bootstrap.enableDemoData) {
    throw new Error("ENABLE_DEMO_DATA darf in Produktion nicht aktiviert sein.");
  }

  if (config.isProduction && !config.session.secure) {
    throw new Error("SESSION_SECURE darf in Produktion nicht deaktiviert sein.");
  }

  if (config.isProduction && config.bootstrap.resetDatabaseOnStart) {
    throw new Error("RESET_DATABASE_ON_START darf in Produktion nicht aktiviert sein.");
  }

  if (config.session.cookieDomain && ["localhost", "127.0.0.1"].includes(config.session.cookieDomain)) {
    throw new Error("SESSION_COOKIE_DOMAIN darf nicht auf localhost oder 127.0.0.1 gesetzt werden.");
  }

  return config;
}

module.exports = {
  createConfig,
  readBooleanEnv,
  normalizeBasePath
};
