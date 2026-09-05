import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAuthService } = require("../services/auth-service");
const { escapeHtml } = require("../utils/mailer");

function buildService() {
  let stored = null;
  const sent = [];
  const user = {
    id: 7,
    name: "Test <Azubi> & Co",
    username: "test-azubi",
    email: "azubi@example.test"
  };
  const authRepository = {
    async findUserByIdentifier(identifier) {
      return ["test-azubi", user.email].includes(identifier) ? user : null;
    },
    async replacePasswordResetToken(userId, tokenHash, expiresAt) {
      stored = { userId, tokenHash, expiresAt, used: false };
    },
    async deletePasswordResetToken() {
      stored = null;
    },
    async consumePasswordResetToken(tokenHash, passwordHash) {
      if (!stored || stored.used || stored.tokenHash !== tokenHash || stored.expiresAt <= new Date()) {
        return null;
      }
      stored.used = true;
      stored.passwordHash = passwordHash;
      return user;
    }
  };
  const helpers = {
    async getPasswordResetRateLimit() {
      return { limited: false };
    },
    async recordPasswordResetRequest() {},
    async clearLoginFailuresForKey() {},
    hashPassword(password) {
      return `hash:${password}`;
    },
    getClientIp() {
      return "127.0.0.1";
    }
  };
  const mailer = {
    isConfigured: true,
    escapeHtml,
    async send(message) {
      sent.push(message);
    }
  };
  const service = createAuthService({
    authRepository,
    helpers,
    mailer,
    logger: { warn() {}, error() {} },
    config: {
      app: { publicBaseUrl: "https://berichte.example.test" },
      mail: { passwordResetTtlMinutes: 60 }
    }
  });
  return { service, sent, getStored: () => stored };
}

test("Passwort-Reset speichert nur einen Hash und versendet einen Einmal-Link", async () => {
  const { service, sent, getStored } = buildService();
  const response = await service.requestPasswordReset({ identifier: "test-azubi" }, {});

  assert.equal(response.ok, true);
  assert.equal(sent.length, 1);
  const resetUrl = sent[0].text.match(/https:\/\/\S+/)?.[0];
  assert.ok(resetUrl);
  const htmlResetUrl = sent[0].html.match(/href="([^"]+)"/)?.[1];
  assert.equal(htmlResetUrl, resetUrl);
  assert.match(sent[0].html, /Test &lt;Azubi&gt; &amp; Co/);
  assert.doesNotMatch(sent[0].html, /Test <Azubi>/);
  const token = new URL(resetUrl).searchParams.get("token");
  assert.ok(token);
  assert.notEqual(getStored().tokenHash, token);
  assert.equal(getStored().tokenHash, crypto.createHash("sha256").update(token).digest("hex"));

  const reset = await service.resetPassword({
    token,
    newPassword: "NeuesPasswort123!",
    newPasswordRepeat: "NeuesPasswort123!"
  }, {});
  assert.equal(reset.ok, true);
  assert.equal(getStored().passwordHash, "hash:NeuesPasswort123!");

  await assert.rejects(
    service.resetPassword({
      token,
      newPassword: "NochEinPasswort123!",
      newPasswordRepeat: "NochEinPasswort123!"
    }, {}),
    /ungültig, abgelaufen oder wurde bereits verwendet/
  );
});

test("Passwort-Reset verrät nicht, ob ein Konto existiert", async () => {
  const { service, sent } = buildService();
  const response = await service.requestPasswordReset({ identifier: "unbekannt" }, {});
  assert.equal(response.ok, true);
  assert.match(response.message, /Wenn ein passendes Konto existiert/);
  assert.equal(sent.length, 0);
});
