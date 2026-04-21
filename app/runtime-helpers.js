const bcrypt = require("bcryptjs");

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEntry(input) {
  const dateFrom = String(input.dateFrom || "").trim();
  return {
    id: String(input.id || `entry-${Date.now()}-${Math.random()}`),
    weekLabel: String(input.weekLabel || "").trim(),
    dateFrom,
    dateTo: String(input.dateTo || dateFrom).trim(),
    betrieb: String(input.betrieb || "").trim(),
    schule: String(input.schule || "").trim(),
    status: String(input.status || "draft"),
    signedAt: input.status === "signed" ? input.signedAt || new Date().toISOString() : input.signedAt || null,
    signerName: String(input.signerName || "").trim(),
    trainerComment: String(input.trainerComment || "").trim(),
    rejectionReason: String(input.rejectionReason || "").trim()
  };
}

function normalizeThemePreference(input) {
  const value = String(input || "").trim().toLowerCase();
  return ["light", "dark", "system"].includes(value) ? value : "system";
}

module.exports = {
  hashPassword,
  isValidEmail,
  normalizeUsername,
  normalizeEntry,
  normalizeThemePreference
};
