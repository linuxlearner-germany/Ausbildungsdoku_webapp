import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { buildIntegrationTestEnv } from "../helpers/test-env.mjs";

const require = createRequire(import.meta.url);
const { createConfig } = require("../../app/config");
const { createDb } = require("../../app/create-db");
const { runMigrations } = require("../../app/run-migrations");
const { createReminderService } = require("../../services/reminder-service");
const { escapeHtml } = require("../../utils/mailer");

function insertedId(result) {
  return Number(result[0]?.id ?? result[0]);
}

await test("Erinnerungen werden ab 50 offenen Berichten versendet und pro Tag dedupliziert", { concurrency: false }, async () => {
  const config = createConfig({
    env: buildIntegrationTestEnv({
      MSSQL_HOST: process.env.MSSQL_HOST || "127.0.0.1",
      MSSQL_PORT: process.env.MSSQL_PORT || "1433",
      SMTP_ENABLED: "false"
    })
  });
  const db = createDb(config);
  const suffix = crypto.randomUUID().slice(0, 8);
  let traineeId;
  let trainerId;

  try {
    await runMigrations({ db });
    trainerId = insertedId(await db("users").insert({
      name: "Reminder & Ausbilder",
      username: `reminder-trainer-${suffix}`,
      email: `reminder-trainer-${suffix}@example.test`,
      password_hash: "nicht-fuer-login",
      role: "trainer"
    }).returning("id"));
    traineeId = insertedId(await db("users").insert({
      name: "Reminder <Azubi>",
      username: `reminder-azubi-${suffix}`,
      email: `reminder-azubi-${suffix}@example.test`,
      password_hash: "nicht-fuer-login",
      role: "trainee",
      ausbildungs_start: "2026-01-01",
      ausbildungs_ende: "2029-12-31"
    }).returning("id"));
    await db("trainee_trainers").insert({ trainee_id: traineeId, trainer_id: trainerId });

    const entries = Array.from({ length: 50 }, (_, index) => {
      const date = new Date(2026, 0, 1 + index);
      const dateFrom = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      ].join("-");
      return {
        id: crypto.randomUUID(),
        trainee_id: traineeId,
        weekLabel: `Bericht ${index + 1}`,
        dateFrom,
        dateTo: dateFrom,
        status: "submitted"
      };
    });
    await db("entries").insert(entries);

    const sent = [];
    const mailer = {
      isConfigured: true,
      escapeHtml,
      async send(message) {
        sent.push(message);
      }
    };
    const reminderService = createReminderService({
      db,
      mailer,
      logger: { info() {}, error() {} },
      config: {
        app: { publicBaseUrl: "https://berichte.example.test" },
        reminders: {
          enabled: true,
          checkIntervalMs: 900_000,
          sendHour: 17,
          weekdaysOnly: true,
          trainerBacklogThreshold: 50
        }
      }
    });

    const first = await reminderService.run({ now: new Date(2026, 3, 30, 17, 0, 0), force: true });
    const second = await reminderService.run({ now: new Date(2026, 3, 30, 18, 0, 0), force: true });

    assert.ok(first.traineeSent >= 1);
    assert.equal(first.trainerSent, 1);
    assert.ok(sent.some((message) => message.to === `reminder-azubi-${suffix}@example.test`));
    assert.ok(sent.some((message) => message.to === `reminder-trainer-${suffix}@example.test`));
    const traineeMessage = sent.find((message) => message.to === `reminder-azubi-${suffix}@example.test`);
    const trainerMessage = sent.find((message) => message.to === `reminder-trainer-${suffix}@example.test`);
    assert.match(traineeMessage.text, /https:\/\/berichte\.example\.test\/berichte/);
    assert.match(traineeMessage.html, /href="https:\/\/berichte\.example\.test\/berichte"/);
    assert.match(traineeMessage.html, /Reminder &lt;Azubi&gt;/);
    assert.doesNotMatch(traineeMessage.html, /Reminder <Azubi>/);
    assert.match(trainerMessage.text, /https:\/\/berichte\.example\.test\/freigaben/);
    assert.match(trainerMessage.html, /href="https:\/\/berichte\.example\.test\/freigaben"/);
    assert.match(trainerMessage.html, /Reminder &amp; Ausbilder/);
    assert.equal(second.traineeSent, 0);
    assert.equal(second.trainerSent, 0);
  } finally {
    await db("mail_deliveries").where("dedupe_key", "like", "%:2026-04-30").del();
    if (traineeId || trainerId) {
      const userIds = [traineeId, trainerId].filter(Boolean);
      await db("mail_deliveries").whereIn("user_id", userIds).del();
      await db("password_reset_tokens").whereIn("user_id", userIds).del();
      if (traineeId) {
        await db("entries").where({ trainee_id: traineeId }).del();
        await db("grades").where({ trainee_id: traineeId }).del();
        await db("trainee_trainers").where({ trainee_id: traineeId }).del();
      }
      if (trainerId) {
        await db("trainee_trainers").where({ trainer_id: trainerId }).del();
      }
      await db("users").whereIn("id", userIds).del();
    }
    await db.destroy();
  }
});
