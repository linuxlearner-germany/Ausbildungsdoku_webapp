import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAdminService } = require("../services/admin-service");
const { createMailer } = require("../utils/mailer");

function buildService() {
  let row = null;
  const sent = [];
  const auditLogs = [];
  const adminRepository = {
    async getEmailRelaySettings() {
      return row;
    },
    async saveEmailRelaySettings(settings, actorId) {
      row = {
        id: 1,
        enabled: settings.enabled,
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        require_tls: settings.requireTls,
        html_enabled: settings.htmlEnabled,
        username: settings.username,
        password_encrypted: settings.passwordEncrypted,
        from_address: settings.from,
        reply_to: settings.replyTo,
        updated_by_user_id: actorId
      };
    }
  };
  const mailer = createMailer({
    config: {
      mail: {
        enabled: false,
        host: "",
        port: 587,
        secure: false,
        requireTls: true,
        htmlEnabled: true,
        user: "",
        password: "",
        from: "",
        replyTo: ""
      }
    },
    logger: { info() {} },
    async getEmailRelaySettings() {
      return row ? { ...row, password: null } : null;
    },
    transportFactory() {
      return {
        async sendMail(message) {
          sent.push(message);
          return { messageId: "relay-test" };
        }
      };
    }
  });
  const service = createAdminService({
    adminRepository,
    mailer,
    encryptSetting: (value) => `encrypted:${value}`,
    sessionSecret: "test-secret",
    helpers: {
      isValidEmail: (value) => /^[^@]+@[^@]+$/.test(value),
      async writeAuditLog(payload) {
        auditLogs.push(payload);
      }
    }
  });
  return { service, sent, auditLogs };
}

const payload = (htmlEnabled) => ({
  enabled: true,
  host: "smtp.example.test",
  port: 587,
  secure: false,
  requireTls: true,
  htmlEnabled,
  username: "",
  password: "",
  clearPassword: false,
  from: "noreply@example.test",
  replyTo: ""
});

test("Relay-Einstellung verwendet standardmaessig HTML mit Klartext-Fallback", async () => {
  const { service } = buildService();
  assert.equal((await service.getEmailRelaySettings()).htmlEnabled, true);
});

test("Relay-Einstellung speichert Formatstatus und Audit ohne sensible Inhalte", async () => {
  const { service, auditLogs } = buildService();
  const result = await service.saveEmailRelaySettings(
    { id: 1, role: "admin" },
    payload(false)
  );

  assert.equal(result.settings.htmlEnabled, false);
  assert.equal(auditLogs[0].actionType, "EMAIL_RELAY_UPDATED");
  assert.deepEqual(auditLogs[0].metadata, { htmlEnabled: false });
  assert.equal(Object.hasOwn(auditLogs[0].metadata, "password"), false);
  assert.equal(Object.hasOwn(auditLogs[0].metadata, "text"), false);
  assert.equal(Object.hasOwn(auditLogs[0].metadata, "html"), false);
});

test("SMTP-Test-E-Mail benennt den gespeicherten Formatmodus", async () => {
  const { service, sent } = buildService();
  const actor = { id: 1, role: "admin", email: "admin@example.test" };

  await service.testEmailRelaySettings(actor, payload(false));
  assert.match(sent[0].text, /Getesteter Modus: Nur Klartext/);
  assert.equal(Object.hasOwn(sent[0], "html"), false);

  await service.testEmailRelaySettings(actor, payload(true));
  assert.match(sent[1].text, /Getesteter Modus: HTML mit Klartext-Fallback/);
  assert.match(sent[1].html, /HTML mit Klartext-Fallback/);
});
