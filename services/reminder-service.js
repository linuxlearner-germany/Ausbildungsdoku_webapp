const { buildTrainingProgress } = require("../utils/training-progress");
const { traineeReminderTemplate, trainerReminderTemplate } = require("../utils/mail-templates");

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function createReminderService({ db, config, mailer, logger }) {
  let running = false;
  let timer = null;

  async function claimDelivery({ userId, mailType, dedupeKey, email }) {
    const existing = await db("mail_deliveries").where({ dedupe_key: dedupeKey }).first("id");
    if (existing) {
      return null;
    }

    try {
      const inserted = await db("mail_deliveries")
        .insert({
          user_id: userId,
          mail_type: mailType,
          dedupe_key: dedupeKey,
          recipient_email: email,
          status: "pending"
        })
        .returning("id");
      return Number(inserted[0]?.id ?? inserted[0]);
    } catch (error) {
      const duplicate = await db("mail_deliveries").where({ dedupe_key: dedupeKey }).first("id");
      if (duplicate) {
        return null;
      }
      throw error;
    }
  }

  async function deliver({ user, mailType, dedupeKey, subject, text, html, htmlAttachments }) {
    const deliveryId = await claimDelivery({
      userId: user.id,
      mailType,
      dedupeKey,
      email: user.email
    });
    if (!deliveryId) {
      return false;
    }

    try {
      await mailer.send({ to: user.email, subject, text, html, htmlAttachments });
      await db("mail_deliveries").where({ id: deliveryId }).update({
        status: "sent",
        sent_at: db.fn.now(),
        error_message: null
      });
      return true;
    } catch (error) {
      await db("mail_deliveries").where({ id: deliveryId }).update({
        status: "failed",
        error_message: String(error.message || error).slice(0, 2000)
      });
      logger.error("Erinnerungs-E-Mail konnte nicht versendet werden.", {
        userId: user.id,
        mailType,
        error
      });
      return false;
    }
  }

  async function sendTraineeReminders(now, dateKey) {
    const trainees = await db("users")
      .select("id", "name", "email", "ausbildungs_start as trainingStart", "ausbildungs_ende as trainingEnd")
      .where({ role: "trainee" });
    const entries = await db("entries").select("trainee_id as traineeId", "dateFrom");
    const datesByTrainee = new Map();
    for (const entry of entries) {
      if (!datesByTrainee.has(entry.traineeId)) {
        datesByTrainee.set(entry.traineeId, []);
      }
      datesByTrainee.get(entry.traineeId).push(entry);
    }

    let sent = 0;
    for (const trainee of trainees) {
      const progress = buildTrainingProgress({
        trainingStartDate: trainee.trainingStart,
        trainingEndDate: trainee.trainingEnd,
        entries: datesByTrainee.get(trainee.id) || [],
        today: now
      });
      if (!progress.available || progress.missingReportDays < 1 || !trainee.email) {
        continue;
      }

      const reportsUrl = `${config.app.publicBaseUrl}/berichte`;
      const delivered = await deliver({
        user: trainee,
        mailType: "TRAINEE_REPORT_REMINDER",
        dedupeKey: `trainee-report:${trainee.id}:${dateKey}`,
        ...traineeReminderTemplate({ name: trainee.name, missingReportDays: progress.missingReportDays, reportsUrl })
      });
      sent += delivered ? 1 : 0;
    }
    return sent;
  }

  async function sendTrainerBacklogReminders(dateKey) {
    const trainers = await db("users")
      .join("trainee_trainers", "trainee_trainers.trainer_id", "users.id")
      .join("entries", function joinEntries() {
        this.on("entries.trainee_id", "=", "trainee_trainers.trainee_id")
          .andOnVal("entries.status", "=", "submitted");
      })
      .select("users.id", "users.name", "users.email")
      .countDistinct("entries.id as openCount")
      .where("users.role", "trainer")
      .groupBy("users.id", "users.name", "users.email")
      .havingRaw("COUNT(DISTINCT entries.id) >= ?", [config.reminders.trainerBacklogThreshold]);

    let sent = 0;
    for (const trainer of trainers) {
      const openCount = Number(trainer.openCount || 0);
      if (!trainer.email) {
        continue;
      }

      const approvalsUrl = `${config.app.publicBaseUrl}/freigaben`;
      const delivered = await deliver({
        user: trainer,
        mailType: "TRAINER_BACKLOG_REMINDER",
        dedupeKey: `trainer-backlog:${trainer.id}:${dateKey}`,
        ...trainerReminderTemplate({ name: trainer.name, openCount, approvalsUrl })
      });
      sent += delivered ? 1 : 0;
    }
    return sent;
  }

  async function run({ now = new Date(), force = false } = {}) {
    const mailerConfigured = typeof mailer.isConfigured === "function" ? await mailer.isConfigured() : Boolean(mailer.isConfigured);
    if (!config.reminders.enabled || !mailerConfigured || running) {
      return { skipped: true, traineeSent: 0, trainerSent: 0 };
    }
    if (!force) {
      const day = now.getDay();
      if ((config.reminders.weekdaysOnly && (day === 0 || day === 6)) || now.getHours() < config.reminders.sendHour) {
        return { skipped: true, traineeSent: 0, trainerSent: 0 };
      }
    }

    running = true;
    try {
      const dateKey = localDateKey(now);
      const retentionLimit = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      await db("mail_deliveries").where("created_at", "<", retentionLimit).del();
      const [traineeSent, trainerSent] = await Promise.all([
        sendTraineeReminders(now, dateKey),
        sendTrainerBacklogReminders(dateKey)
      ]);
      logger.info("E-Mail-Erinnerungen verarbeitet", { traineeSent, trainerSent, dateKey });
      return { skipped: false, traineeSent, trainerSent };
    } finally {
      running = false;
    }
  }

  function start() {
    if (!config.reminders.enabled || timer) {
      return;
    }
    timer = setInterval(() => {
      run().catch((error) => logger.error("Erinnerungslauf fehlgeschlagen.", { error }));
    }, config.reminders.checkIntervalMs);
    timer.unref();
    run().catch((error) => logger.error("Initialer Erinnerungslauf fehlgeschlagen.", { error }));
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { run, start, stop };
}

module.exports = {
  createReminderService,
  localDateKey
};
