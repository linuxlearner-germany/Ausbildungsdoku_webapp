const path = require("path");
require("dotenv").config();

function readBooleanEnv(value) {
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

function createConfig() {
  const projectRoot = path.resolve(__dirname, "..");
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(projectRoot, "data");
  const dbFile = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(dataDir, "berichtsheft.db");
  const legacyFile = process.env.LEGACY_FILE ? path.resolve(process.env.LEGACY_FILE) : path.join(dataDir, "berichtsheft.json");
  const publicDir = path.join(projectRoot, "public");
  const picturesDir = path.join(projectRoot, "Pictures");

  const config = {
    projectRoot,
    publicDir,
    picturesDir,
    host: String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1",
    port: Number(process.env.PORT || 3010),
    nodeEnv: String(process.env.NODE_ENV || "development"),
    isProduction: process.env.NODE_ENV === "production",
    sessionSecret: process.env.SESSION_SECRET,
    sessionCookieName: String(process.env.SESSION_COOKIE_NAME || "berichtsheft.sid").trim() || "berichtsheft.sid",
    initialAdminUsername: String(process.env.INITIAL_ADMIN_USERNAME || "admin").trim() || "admin",
    initialAdminEmail: String(process.env.INITIAL_ADMIN_EMAIL || "admin@example.com").trim() || "admin@example.com",
    initialAdminPassword: String(process.env.INITIAL_ADMIN_PASSWORD || "admin123"),
    dataDir,
    dbFile,
    legacyFile,
    enableDemoData: process.env.ENABLE_DEMO_DATA === "true",
    trustProxy: readBooleanEnv(process.env.TRUST_PROXY)
  };

  if (config.isProduction && !config.sessionSecret) {
    throw new Error("SESSION_SECRET muss in Produktion gesetzt sein.");
  }

  if (config.isProduction && config.enableDemoData) {
    throw new Error("ENABLE_DEMO_DATA darf in Produktion nicht aktiviert sein.");
  }

  return config;
}

module.exports = {
  createConfig
};
