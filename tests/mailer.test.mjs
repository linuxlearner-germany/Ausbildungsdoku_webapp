import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createMailer } = require("../utils/mailer");

function createTestMailer(htmlEnabled) {
  const sent = [];
  const mailer = createMailer({
    config: {
      mail: {
        enabled: true,
        host: "smtp.example.test",
        port: 587,
        secure: false,
        requireTls: true,
        user: "",
        password: "",
        from: "noreply@example.test",
        replyTo: ""
      }
    },
    logger: { info() {} },
    async getEmailRelaySettings() {
      return {
        enabled: true,
        host: "smtp.example.test",
        port: 587,
        secure: false,
        require_tls: true,
        html_enabled: htmlEnabled,
        username: "",
        password: "",
        from_address: "noreply@example.test",
        reply_to: ""
      };
    },
    transportFactory() {
      return {
        async sendMail(message) {
          sent.push(message);
          return { messageId: "test-message" };
        }
      };
    }
  });
  return { mailer, sent };
}

test("Mailer sendet bei deaktiviertem HTML ausschliesslich Klartext", async () => {
  const { mailer, sent } = createTestMailer(false);
  await mailer.send({ to: "user@example.test", subject: "Test", text: "Klartext", html: "<p>HTML</p>", htmlAttachments: [{ cid: "logo" }] });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, "Klartext");
  assert.equal(Object.hasOwn(sent[0], "html"), false);
  assert.equal(Object.hasOwn(sent[0], "attachments"), false);
});

test("Mailer sendet bei aktiviertem HTML Klartext und HTML gemeinsam", async () => {
  const { mailer, sent } = createTestMailer(true);
  await mailer.send({ to: "user@example.test", subject: "Test", text: "Klartext", html: "<p>HTML</p>", htmlAttachments: [{ cid: "logo" }] });

  assert.equal(sent[0].text, "Klartext");
  assert.equal(sent[0].html, "<p>HTML</p>");
  assert.deepEqual(sent[0].attachments, [{ cid: "logo" }]);
});

test("Mailer faellt ohne HTML-Vorlage automatisch auf Klartext zurueck", async () => {
  const { mailer, sent } = createTestMailer(true);
  await mailer.send({ to: "user@example.test", subject: "Test", text: "Klartext" });
  assert.equal(Object.hasOwn(sent[0], "html"), false);
});

test("Mailer lehnt Nachrichten ohne Klartextinhalt ab", async () => {
  const { mailer, sent } = createTestMailer(true);
  await assert.rejects(
    mailer.send({ to: "user@example.test", subject: "Test", text: "  ", html: "<p>Nur HTML</p>" }),
    (error) => error.code === "MAIL_TEXT_REQUIRED"
  );
  assert.equal(sent.length, 0);
});
