const path = require("path");
const { escapeHtml } = require("./mailer");

const PRODUCT_NAME = "WIWEB Berichtsheft";
const LOGO_CID = "wiweb-wordmark@berichtsheft";
const LOGO_PATH = path.resolve(__dirname, "../Pictures/logo-short.png");

function layout({ preheader, heading, body, actionLabel, actionUrl }) {
  const safePreheader = escapeHtml(preheader);
  const safeHeading = escapeHtml(heading);
  const safeActionLabel = actionLabel ? escapeHtml(actionLabel) : "";
  const safeActionUrl = actionUrl ? escapeHtml(actionUrl) : "";
  const action = actionUrl
    ? `<p style="margin:28px 0 20px"><a href="${safeActionUrl}" style="display:inline-block;background:#0065a8;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px">${safeActionLabel}</a></p><p style="margin:0 0 24px;color:#44546a;font-size:13px;line-height:1.5;word-break:break-all">Vollständiger Link:<br><a href="${safeActionUrl}" style="color:#0065a8">${safeActionUrl}</a></p>`
    : "";

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeHeading}</title></head>
<body style="margin:0;background:#eef3f7;color:#172b3a;font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${safePreheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d7e1e8;border-radius:8px;overflow:hidden">
<tr><td style="padding:24px 32px;border-top:6px solid #0065a8"><img src="cid:${LOGO_CID}" width="210" alt="WIWEB" style="display:block;width:210px;max-width:100%;height:auto"></td></tr>
<tr><td style="padding:8px 32px 32px"><h1 style="margin:0 0 20px;color:#0065a8;font-size:24px;line-height:1.25">${safeHeading}</h1>${body}${action}</td></tr>
<tr><td style="padding:18px 32px;background:#f5f8fa;color:#5d6b78;font-size:12px;line-height:1.5;border-top:1px solid #d7e1e8">${PRODUCT_NAME}<br>Digitaler Ausbildungsnachweis</td></tr>
</table></td></tr></table></body></html>`;
}

function withHtmlResources(message) {
  return {
    ...message,
    htmlAttachments: [{ filename: "wiweb-logo.png", path: LOGO_PATH, cid: LOGO_CID, contentDisposition: "inline" }]
  };
}

function passwordResetTemplate({ name, resetUrl, ttlMinutes }) {
  const displayName = String(name ?? "");
  const minutes = String(ttlMinutes ?? "");
  return withHtmlResources({
    subject: `${PRODUCT_NAME}: Passwort zurücksetzen`,
    text: `Hallo ${displayName},\n\nüber diesen Link kannst du dein Passwort für ${PRODUCT_NAME} innerhalb von ${minutes} Minuten zurücksetzen:\n${resetUrl}\n\nWenn du die Anfrage nicht gestellt hast, ignoriere diese E-Mail.`,
    html: layout({
      preheader: `Passwort für ${PRODUCT_NAME} zurücksetzen`,
      heading: "Passwort zurücksetzen",
      body: `<p style="margin:0 0 16px;line-height:1.6">Hallo ${escapeHtml(displayName)},</p><p style="margin:0 0 16px;line-height:1.6">über diesen Link kannst du dein Passwort für ${PRODUCT_NAME} innerhalb von ${escapeHtml(minutes)} Minuten zurücksetzen.</p><p style="margin:0;line-height:1.6">Wenn du die Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>`,
      actionLabel: "Passwort zurücksetzen",
      actionUrl: resetUrl
    })
  });
}

function traineeReminderTemplate({ name, missingReportDays, reportsUrl }) {
  const displayName = String(name ?? "");
  const missingDays = String(missingReportDays ?? "");
  return withHtmlResources({
    subject: `${PRODUCT_NAME}: Ausbildungsnachweis vervollständigen`,
    text: `Hallo ${displayName},\n\ndir fehlen aktuell ${missingDays} Berichtstage. Bitte vervollständige deinen digitalen Ausbildungsnachweis in ${PRODUCT_NAME}:\n${reportsUrl}`,
    html: layout({
      preheader: `${missingDays} fehlende Berichtstage`,
      heading: "Ausbildungsnachweis vervollständigen",
      body: `<p style="margin:0 0 16px;line-height:1.6">Hallo ${escapeHtml(displayName)},</p><p style="margin:0;line-height:1.6">dir fehlen aktuell <strong>${escapeHtml(missingDays)} Berichtstage</strong>. Bitte vervollständige deinen digitalen Ausbildungsnachweis in ${PRODUCT_NAME}.</p>`,
      actionLabel: "Berichte öffnen",
      actionUrl: reportsUrl
    })
  });
}

function trainerReminderTemplate({ name, openCount, approvalsUrl }) {
  const displayName = String(name ?? "");
  const count = String(openCount ?? "");
  return withHtmlResources({
    subject: `${PRODUCT_NAME}: ${count} Berichte warten auf Freigabe`,
    text: `Hallo ${displayName},\n\naktuell warten ${count} eingereichte Berichte auf deine Prüfung:\n${approvalsUrl}`,
    html: layout({
      preheader: `${count} Berichte warten auf Freigabe`,
      heading: "Berichte zur Freigabe",
      body: `<p style="margin:0 0 16px;line-height:1.6">Hallo ${escapeHtml(displayName)},</p><p style="margin:0;line-height:1.6">aktuell warten <strong>${escapeHtml(count)} eingereichte Berichte</strong> auf deine Prüfung.</p>`,
      actionLabel: "Freigaben öffnen",
      actionUrl: approvalsUrl
    })
  });
}

function testEmailTemplate({ htmlEnabled }) {
  const formatLabel = htmlEnabled ? "HTML mit Klartext-Fallback" : "Nur Klartext";
  return withHtmlResources({
    subject: `${PRODUCT_NAME}: E-Mail-Test`,
    text: `Die E-Mail-Relay-Konfiguration für ${PRODUCT_NAME} funktioniert.\n\nGetesteter Modus: ${formatLabel}.`,
    html: layout({
      preheader: "E-Mail-Relay erfolgreich getestet",
      heading: "E-Mail-Test erfolgreich",
      body: `<p style="margin:0 0 16px;line-height:1.6">Die E-Mail-Relay-Konfiguration für ${PRODUCT_NAME} funktioniert.</p><p style="margin:0;line-height:1.6"><strong>Getesteter Modus:</strong> ${escapeHtml(formatLabel)}.</p>`
    })
  });
}

module.exports = {
  passwordResetTemplate,
  traineeReminderTemplate,
  trainerReminderTemplate,
  testEmailTemplate
};
