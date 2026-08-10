import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { encryptSetting, decryptSetting } = require("../utils/settings-crypto");

await test("Relay-Geheimnisse werden authentifiziert verschluesselt", () => {
  const secret = "eine-lange-session-geheimniszeichenfolge-fuer-tests";
  const encrypted = encryptSetting("smtp-passwort", secret);
  assert.notEqual(encrypted, "smtp-passwort");
  assert.equal(decryptSetting(encrypted, secret), "smtp-passwort");
  assert.equal(encryptSetting("", secret), null);
});

await test("Relay-Geheimnisse lassen sich nicht mit einem anderen Session-Secret lesen", () => {
  const encrypted = encryptSetting("smtp-passwort", "erste-lange-session-geheimniszeichenfolge-fuer-tests");
  assert.throws(() => decryptSetting(encrypted, "zweite-lange-session-geheimniszeichenfolge-fuer-tests"));
});
