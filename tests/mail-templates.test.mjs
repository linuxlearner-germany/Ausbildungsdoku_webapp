import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  passwordResetTemplate,
  traineeReminderTemplate,
  trainerReminderTemplate,
  testEmailTemplate
} = require("../utils/mail-templates");

test("alle Systemmail-Templates liefern Klartext, HTML und das eingebettete WIWEB-Logo", () => {
  const templates = [
    passwordResetTemplate({ name: "Azubi", resetUrl: "https://example.test/reset", ttlMinutes: 60 }),
    traineeReminderTemplate({ name: "Azubi", missingReportDays: 2, reportsUrl: "https://example.test/berichte" }),
    trainerReminderTemplate({ name: "Ausbilder", openCount: 3, approvalsUrl: "https://example.test/freigaben" }),
    testEmailTemplate({ htmlEnabled: true })
  ];

  for (const message of templates) {
    assert.ok(message.subject.trim());
    assert.ok(message.text.trim());
    assert.match(message.html, /<!doctype html>/i);
    assert.match(message.html, /max-width:600px/);
    assert.match(message.html, /src="cid:wiweb-wordmark@berichtsheft"/);
    assert.equal(message.htmlAttachments[0].cid, "wiweb-wordmark@berichtsheft");
    assert.match(message.htmlAttachments[0].path, /Pictures[/\\]logo-short\.png$/);
  }
});

test("Links sind in Klartext und HTML identisch und dynamische HTML-Werte werden escaped", () => {
  const url = "https://example.test/reset?token=a%22b&next=%3Cscript%3E";
  const message = passwordResetTemplate({ name: "<Azubi & Co>", resetUrl: url, ttlMinutes: "60<script>" });

  assert.match(message.text, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(message.html, /href="https:\/\/example\.test\/reset\?token=a%22b&amp;next=%3Cscript%3E"/);
  assert.match(message.html, /&lt;Azubi &amp; Co&gt;/);
  assert.doesNotMatch(message.html, /<Azubi|60<script>/);
});
