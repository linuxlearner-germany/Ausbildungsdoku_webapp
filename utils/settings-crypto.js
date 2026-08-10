const crypto = require("crypto");

const ENCRYPTION_VERSION = "v1";
const KEY_SALT = "ausbildungsdoku:email-relay-settings:v1";

function deriveKey(sessionSecret) {
  if (!sessionSecret || String(sessionSecret).length < 16) {
    throw new Error("SESSION_SECRET ist fuer die Verschluesselung der Relay-Einstellungen nicht geeignet.");
  }
  return crypto.scryptSync(String(sessionSecret), KEY_SALT, 32);
}

function encryptSetting(value, sessionSecret) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(sessionSecret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENCRYPTION_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptSetting(value, sessionSecret) {
  if (!value) return "";
  const [version, ivValue, tagValue, encryptedValue] = String(value).split(".");
  if (version !== ENCRYPTION_VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Gespeicherte Relay-Zugangsdaten sind nicht lesbar.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(sessionSecret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

module.exports = { encryptSetting, decryptSetting };
