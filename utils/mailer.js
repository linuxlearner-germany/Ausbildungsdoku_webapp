const nodemailer = require("nodemailer");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createMailer({ config, logger, getEmailRelaySettings = async () => null }) {
  function getEnvironmentSettings() {
    return {
      enabled: config.mail.enabled,
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      requireTls: config.mail.requireTls,
      user: config.mail.user,
      password: config.mail.password,
      from: config.mail.from,
      replyTo: config.mail.replyTo
    };
  }

  async function getActiveSettings() {
    const saved = await getEmailRelaySettings();
    if (!saved) return getEnvironmentSettings();
    return {
      enabled: Boolean(saved.enabled),
      host: saved.host,
      port: Number(saved.port),
      secure: Boolean(saved.secure),
      requireTls: Boolean(saved.require_tls),
      user: saved.username,
      password: saved.password,
      from: saved.from_address,
      replyTo: saved.reply_to
    };
  }

  function createTransport(settings) {
    return nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: settings.requireTls,
      // Ohne erzwungenes TLS soll Nodemailer nicht opportunistisch STARTTLS
      // mit einem unbekannten bzw. selbstsignierten Zertifikat aushandeln.
      ignoreTLS: !settings.secure && !settings.requireTls,
      auth: settings.user ? { user: settings.user, pass: settings.password } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000
    });
  }

  async function isConfigured() {
    const settings = await getActiveSettings();
    return Boolean(settings.enabled && settings.host && settings.from && (!settings.user || settings.password));
  }

  async function send({ to, subject, text, html }) {
    const settings = await getActiveSettings();
    if (!(settings.enabled && settings.host && settings.from && (!settings.user || settings.password))) {
      const error = new Error("SMTP ist nicht konfiguriert.");
      error.code = "SMTP_NOT_CONFIGURED";
      throw error;
    }

    const result = await createTransport(settings).sendMail({
      from: settings.from,
      replyTo: settings.replyTo || undefined,
      to,
      subject,
      text,
      html
    });
    logger.info("E-Mail versendet", {
      messageId: result.messageId,
      recipientDomain: String(to).split("@").at(-1) || ""
    });
    return result;
  }

  return {
    isConfigured,
    getEnvironmentSettings,
    send,
    escapeHtml
  };
}

module.exports = {
  createMailer,
  escapeHtml
};
