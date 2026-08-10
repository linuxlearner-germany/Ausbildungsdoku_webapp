const nodemailer = require("nodemailer");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createMailer({ config, logger, getEmailRelaySettings = async () => null, transportFactory = nodemailer.createTransport }) {
  function getEnvironmentSettings() {
    return {
      enabled: config.mail.enabled,
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      requireTls: config.mail.requireTls,
      htmlEnabled: true,
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
      htmlEnabled: Boolean(saved.html_enabled),
      user: saved.username,
      password: saved.password,
      from: saved.from_address,
      replyTo: saved.reply_to
    };
  }

  function createTransport(settings) {
    return transportFactory({
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

  async function send({ to, subject, text, html, htmlAttachments = [] }) {
    const plainText = typeof text === "string" ? text : "";
    if (!plainText.trim()) {
      const error = new Error("Klartextinhalt fehlt.");
      error.code = "MAIL_TEXT_REQUIRED";
      throw error;
    }

    const settings = await getActiveSettings();
    if (!(settings.enabled && settings.host && settings.from && (!settings.user || settings.password))) {
      const error = new Error("SMTP ist nicht konfiguriert.");
      error.code = "SMTP_NOT_CONFIGURED";
      throw error;
    }

    const message = {
      from: settings.from,
      replyTo: settings.replyTo || undefined,
      to,
      subject,
      text: plainText
    };
    if (settings.htmlEnabled && typeof html === "string" && html.trim()) {
      message.html = html;
      if (Array.isArray(htmlAttachments) && htmlAttachments.length) {
        message.attachments = htmlAttachments;
      }
    }

    const result = await createTransport(settings).sendMail(message);
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
