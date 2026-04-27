const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

function escapeCsvCell(value) {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sanitized = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${sanitized.replace(/"/g, "\"\"")}"`;
}

function safePdfAssetPath(picturesDir, preferredFileName, fallbackFileName = "") {
  const preferredPath = path.join(picturesDir, preferredFileName);
  if (fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  if (fallbackFileName) {
    const fallbackPath = path.join(picturesDir, fallbackFileName);
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }

  return preferredPath;
}

function formatAdminCsvDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildAdminUsersCsv(users) {
  const headers = ["User-ID", "Name", "Benutzername", "E-Mail", "Rolle", "Ausbildung", "Betrieb", "Berufsschule", "Zugeordnete Ausbilder", "Erstellt am", "Letzter Aenderungszeitpunkt"];
  const rows = users.map((user) => [
    user.id, user.name || "", user.username || "", user.email || "", user.role || "", user.ausbildung || "", user.betrieb || "", user.berufsschule || "",
    Array.isArray(user.assignedTrainers) ? user.assignedTrainers.map((trainer) => trainer.name).join(" | ") : "",
    formatAdminCsvDateTime(user.createdAt), ""
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(";")).join("\r\n")}\r\n`;
}

function formatCsvDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-");
    return `${day}.${month}.${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCsvDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getIsoWeekLabel(value) {
  if (!value) return "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `KW ${String(week).padStart(2, "0")}/${utc.getUTCFullYear()}`;
}

function mapEntryStatusLabel(status) {
  if (status === "draft") return "Entwurf";
  if (status === "submitted") return "Eingereicht";
  if (status === "signed") return "Signiert";
  if (status === "rejected") return "Nachbearbeitung";
  return String(status || "");
}

function mapReleaseStatusLabel(entry) {
  if (entry.status === "signed") return "Signiert";
  if (entry.status === "submitted") return "Zur Freigabe eingereicht";
  if (entry.status === "rejected") return "Zur Nachbearbeitung zurueckgegeben";
  if (entry.status === "draft") return "Nicht eingereicht";
  return "";
}

function buildEntriesCsv(entries) {
  const headers = ["Datum", "Titel", "Status", "Betrieb", "Berufsschule", "Freigabestatus / Signaturstatus", "Signiert von", "Signiert am", "Erstellt am", "Aktualisiert am", "Rueckgabegrund / Kommentar", "Kalenderwoche"];
  const rows = entries.map((entry) => [
    formatCsvDate(entry.dateFrom),
    entry.weekLabel || "",
    mapEntryStatusLabel(entry.status),
    entry.betrieb || "",
    entry.schule || "",
    mapReleaseStatusLabel(entry),
    entry.signerName || "",
    formatCsvDateTime(entry.signedAt),
    formatCsvDateTime(entry.createdAt),
    formatCsvDateTime(entry.updatedAt),
    entry.rejectionReason || entry.trainerComment || "",
    getIsoWeekLabel(entry.dateFrom)
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(";")).join("\r\n")}\r\n`;
}

function normalizePdfText(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function hasMeaningfulPdfContent(value) {
  const normalized = normalizePdfText(value);
  return Boolean(normalized) && !/^[-\s]+$/.test(normalized);
}

function formatPdfDate(value) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-");
    return `${day}.${month}.${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPdfDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toPdfDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return new Date(`${value}T00:00:00`);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getIsoWeekInfo(value) {
  const date = toPdfDate(value);
  if (!date) return null;
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return { year: utc.getUTCFullYear(), week: Math.ceil((((utc - yearStart) / 86400000) + 1) / 7) };
}

function slugifyFilePart(value, fallback = "azubi") {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function resolvePdfFontPaths() {
  const candidates = [
    {
      regular: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      bold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    }
  ];

  return candidates.find((candidate) => fs.existsSync(candidate.regular) && fs.existsSync(candidate.bold)) || null;
}

function registerPdfFonts(doc) {
  const fontPaths = resolvePdfFontPaths();
  if (!fontPaths) {
    return { regular: "Helvetica", bold: "Helvetica-Bold" };
  }

  doc.registerFont("ReportSans", fontPaths.regular);
  doc.registerFont("ReportSans-Bold", fontPaths.bold);
  return { regular: "ReportSans", bold: "ReportSans-Bold" };
}

function renderPdf(res, trainee, entries, picturesDir) {
  const logoPath = safePdfAssetPath(picturesDir, "logo-mark.png", "WIWEB-waage-vektor_ohne_schrift.png");
  const fonts = registerPdfFonts(new PDFDocument({ autoFirstPage: false }));
  const sortedEntries = [...entries]
    .filter((entry) => entry.status === "signed")
    .sort((a, b) => String(a.dateFrom).localeCompare(String(b.dateFrom)));
  const weekGroups = [];

  let currentGroup = null;
  for (const entry of sortedEntries) {
    const weekInfo = getIsoWeekInfo(entry.dateFrom);
    const groupKey = weekInfo ? `${weekInfo.year}-${String(weekInfo.week).padStart(2, "0")}` : `unknown-${entry.id}`;
    if (!currentGroup || currentGroup.key !== groupKey) {
      currentGroup = { key: groupKey, week: weekInfo?.week || "-", year: weekInfo?.year || "-", entries: [] };
      weekGroups.push(currentGroup);
    }
    currentGroup.entries.push(entry);
  }

  const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });
  if (fonts.regular === "ReportSans") {
    doc.registerFont("ReportSans", resolvePdfFontPaths().regular);
    doc.registerFont("ReportSans-Bold", resolvePdfFontPaths().bold);
  }

  const regularFont = fonts.regular;
  const boldFont = fonts.bold;
  const pageBottomY = doc.page.height - doc.page.margins.bottom;
  const cardX = 50;
  const cardWidth = 495;
  const cardPadding = 16;
  const innerX = cardX + cardPadding;
  const innerWidth = cardWidth - (cardPadding * 2);
  const cardGap = 14;
  const contentStartY = 245;

  res.setHeader("Content-Type", "application/pdf; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="berichtsheft-${slugifyFilePart(trainee.name)}.pdf"`);
  doc.pipe(res);

  function setFont(variant, size) {
    doc.font(variant === "bold" ? boldFont : regularFont).fontSize(size);
  }

  function renderHeader(pageTitle, weekLabel = "") {
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 42, { fit: [64, 64] });
    setFont("bold", 22);
    doc.fillColor("#11211F").text("Berichtsheft", 130, 50);
    setFont("regular", 11);
    doc.fillColor("#334155");
    doc.text(`Name: ${trainee.name}`, 130, 80);
    doc.text(`Ausbildung: ${trainee.ausbildung || "-"}`, 130, 96);
    doc.text(`Betrieb: ${trainee.betrieb || "-"}`, 130, 112);
    doc.text(`Berufsschule: ${trainee.berufsschule || "-"}`, 130, 128);
    doc.text(`Stand: ${formatPdfDate(new Date())}`, 130, 144);
    setFont("bold", 15);
    doc.fillColor("#11211F").text(pageTitle, 50, 182);
    if (weekLabel) {
      setFont("regular", 11);
      doc.fillColor("#4B5F5B").text(weekLabel, 50, 202);
    }
    doc.moveTo(50, 225).lineTo(545, 225).strokeColor("#B7C7C1").lineWidth(1).stroke();
  }

  function buildEntryBody(entry) {
    const sections = [];
    if (hasMeaningfulPdfContent(entry.betrieb)) sections.push(["Betrieb", normalizePdfText(entry.betrieb)]);
    if (hasMeaningfulPdfContent(entry.schule)) sections.push(["Berufsschule", normalizePdfText(entry.schule)]);
    if (hasMeaningfulPdfContent(entry.trainerComment)) sections.push(["Kommentar Ausbilder", normalizePdfText(entry.trainerComment)]);
    if (hasMeaningfulPdfContent(entry.rejectionReason)) sections.push(["Rückmeldung", normalizePdfText(entry.rejectionReason)]);
    if (!sections.length) return "Keine Inhalte hinterlegt.";
    return sections.map(([label, content]) => `${label}\n${content}`).join("\n\n");
  }

  function measureTextHeight(text, options) {
    return doc.heightOfString(text || "-", options);
  }

  function fitTextToHeight(text, options, maxHeight) {
    const normalizedText = text || "-";
    if (!normalizedText || maxHeight <= 0) return { fittingText: "", remainingText: normalizedText };
    const fullHeight = measureTextHeight(normalizedText, options);
    if (fullHeight <= maxHeight) return { fittingText: normalizedText, remainingText: "" };

    let low = 1;
    let high = normalizedText.length;
    let best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (measureTextHeight(normalizedText.slice(0, mid), options) <= maxHeight) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (!best) return { fittingText: "", remainingText: normalizedText };
    const searchWindowStart = Math.max(0, best - 120);
    const tail = normalizedText.slice(searchWindowStart, best);
    const breakMatch = tail.match(/[\n\s](?!.*[\n\s])/);
    let cutIndex = breakMatch ? searchWindowStart + breakMatch.index + 1 : best;
    if (cutIndex <= 0) cutIndex = best;
    const fittingText = normalizedText.slice(0, cutIndex).trimEnd();
    return {
      fittingText: fittingText || normalizedText.slice(0, best),
      remainingText: normalizedText.slice(cutIndex).replace(/^\n/, "")
    };
  }

  function drawEntryCard(boxTop, title, statusText, bodyText) {
    const titleOptions = { width: innerWidth, lineGap: 1 };
    const metaOptions = { width: innerWidth, lineGap: 1 };
    const bodyOptions = { width: innerWidth, lineGap: 2 };
    const titleHeight = measureTextHeight(title, titleOptions);
    const metaHeight = measureTextHeight(statusText, metaOptions);
    const bodyHeight = measureTextHeight(bodyText, bodyOptions);
    const boxHeight = cardPadding + titleHeight + 6 + metaHeight + 12 + bodyHeight + cardPadding;

    doc.roundedRect(cardX, boxTop, cardWidth, boxHeight, 10).fillAndStroke("#F7FAF8", "#D7E1DB");
    setFont("bold", 11);
    doc.fillColor("#11211F").text(title, innerX, boxTop + cardPadding, titleOptions);
    setFont("regular", 9.5);
    doc.fillColor("#4B5F5B").text(statusText, innerX, boxTop + cardPadding + titleHeight + 6, metaOptions);
    setFont("regular", 10);
    doc.fillColor("#11211F").text(bodyText, innerX, boxTop + cardPadding + titleHeight + 6 + metaHeight + 12, bodyOptions);
    return boxHeight;
  }

  function renderEntryAcrossPages(entry, weekTitle, weekRange, cursorY) {
    const baseTitle = `${formatPdfDate(entry.dateFrom)} · ${entry.weekLabel || "Ohne Titel"}`;
    const statusText = `Signiert von ${entry.signerName || "-"} am ${formatPdfDateTime(entry.signedAt)}`;
    const bodyText = buildEntryBody(entry);
    const fixedContentHeight = cardPadding
      + measureTextHeight(baseTitle, { width: innerWidth, lineGap: 1 })
      + 6
      + measureTextHeight(statusText, { width: innerWidth, lineGap: 1 })
      + 12
      + cardPadding;
    let remainingBody = bodyText;
    let segmentIndex = 0;

    while (remainingBody) {
      let availableHeight = pageBottomY - cursorY;
      if (availableHeight <= fixedContentHeight + 24) {
        doc.addPage();
        renderHeader(weekTitle, weekRange);
        cursorY = contentStartY;
        availableHeight = pageBottomY - cursorY;
      }

      const { fittingText, remainingText } = fitTextToHeight(remainingBody, { width: innerWidth, lineGap: 2 }, availableHeight - fixedContentHeight);
      if (!fittingText) {
        doc.addPage();
        renderHeader(weekTitle, weekRange);
        cursorY = contentStartY;
        continue;
      }

      const boxHeight = drawEntryCard(cursorY, segmentIndex > 0 ? `${baseTitle} (Fortsetzung)` : baseTitle, statusText, fittingText);
      cursorY += boxHeight + cardGap;
      remainingBody = remainingText;
      segmentIndex += 1;

      if (remainingBody) {
        doc.addPage();
        renderHeader(weekTitle, weekRange);
        cursorY = contentStartY;
      }
    }

    return cursorY;
  }

  if (!weekGroups.length) {
    renderHeader("Keine Tagesberichte vorhanden");
    setFont("regular", 12);
    doc.fillColor("#11211F").text("Aktuell sind keine signierten Einträge für den PDF-Export vorhanden.", 50, 250);
    doc.addPage();
    renderHeader("Unterschriften");
    setFont("bold", 12);
    doc.fillColor("#11211F").text("Bestätigung", 50, 310);
    setFont("regular", 11);
    doc.text("Hiermit wird bestätigt, dass die Berichtsheftführung geprüft wurde.", 50, 332, { width: 495 });
    doc.moveTo(50, 430).lineTo(260, 430).strokeColor("#526763").lineWidth(1).stroke();
    doc.moveTo(320, 430).lineTo(545, 430).strokeColor("#526763").lineWidth(1).stroke();
    doc.fillColor("#5D6F6A").text("Ort, Datum", 50, 438);
    doc.text("Unterschrift Azubi", 320, 438);
    doc.moveTo(50, 520).lineTo(260, 520).strokeColor("#526763").lineWidth(1).stroke();
    doc.moveTo(320, 520).lineTo(545, 520).strokeColor("#526763").lineWidth(1).stroke();
    doc.text("Ort, Datum", 50, 528);
    doc.text("Unterschrift Ausbilder", 320, 528);
    doc.end();
    return;
  }

  weekGroups.forEach((group, groupIndex) => {
    if (groupIndex > 0) doc.addPage();
    const firstDate = formatPdfDate(group.entries[0]?.dateFrom);
    const lastDate = formatPdfDate(group.entries[group.entries.length - 1]?.dateFrom);
    const weekTitle = `KW ${group.week}/${group.year}`;
    const weekRange = `${firstDate} bis ${lastDate}`;
    renderHeader(weekTitle, weekRange);
    let cursorY = contentStartY;
    group.entries.forEach((entry) => {
      cursorY = renderEntryAcrossPages(entry, weekTitle, weekRange, cursorY);
    });
  });

  doc.addPage();
  renderHeader("Unterschriften");
  setFont("bold", 12);
  doc.fillColor("#11211F").text("Bestätigung", 50, 310);
  setFont("regular", 11);
  doc.text("Hiermit wird bestätigt, dass die Berichtsheftführung geprüft wurde.", 50, 332, { width: 495 });
  doc.moveTo(50, 430).lineTo(260, 430).strokeColor("#526763").lineWidth(1).stroke();
  doc.moveTo(320, 430).lineTo(545, 430).strokeColor("#526763").lineWidth(1).stroke();
  doc.fillColor("#5D6F6A").text("Ort, Datum", 50, 438);
  doc.text("Unterschrift Azubi", 320, 438);
  doc.moveTo(50, 520).lineTo(260, 520).strokeColor("#526763").lineWidth(1).stroke();
  doc.moveTo(320, 520).lineTo(545, 520).strokeColor("#526763").lineWidth(1).stroke();
  doc.text("Ort, Datum", 50, 528);
  doc.text("Unterschrift Ausbilder", 320, 528);
  doc.end();
}

function renderGradesPdf(res, trainee, grades, picturesDir) {
  const logoPath = safePdfAssetPath(picturesDir, "logo-mark.png", "WIWEB-waage-vektor_ohne_schrift.png");
  const sortedGrades = [...grades].sort((a, b) => String(a.fach).localeCompare(String(b.fach), "de") || String(a.datum).localeCompare(String(b.datum)));
  const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });
  const formatDate = (value) => formatCsvDate(value) || "-";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="noten-${trainee.name.replace(/\s+/g, "-").toLowerCase()}.pdf"`);
  doc.pipe(res);

  if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 42, { fit: [64, 64] });
  doc.font("Helvetica-Bold").fontSize(22).text("Notenuebersicht", 130, 50);
  doc.font("Helvetica").fontSize(11);
  doc.text(`Name: ${trainee.name}`, 130, 82);
  doc.text(`Ausbildung: ${trainee.ausbildung || "-"}`, 130, 98);
  doc.text(`Stand: ${formatDate(new Date())}`, 130, 114);
  doc.moveTo(50, 150).lineTo(545, 150).strokeColor("#B7C7C1").lineWidth(1).stroke();

  if (!sortedGrades.length) {
    doc.font("Helvetica").fontSize(12).fillColor("#11211F").text("Aktuell sind keine Noten vorhanden.", 50, 180);
    doc.end();
    return;
  }

  const drawHeader = (y) => {
    doc.roundedRect(50, y, 495, 24, 6).fillAndStroke("#E9F1ED", "#D7E1DB");
    doc.fillColor("#11211F").font("Helvetica-Bold").fontSize(10);
    doc.text("Fach", 54, y + 7, { width: 96 });
    doc.text("Art", 150, y + 7, { width: 110 });
    doc.text("Bezeichnung", 260, y + 7, { width: 130 });
    doc.text("Datum", 390, y + 7, { width: 70 });
    doc.text("Note", 460, y + 7, { width: 40, align: "center" });
    doc.text("Gew.", 500, y + 7, { width: 40, align: "center" });
  };

  const drawRow = (grade, y) => {
    doc.fillColor("#11211F").font("Helvetica").fontSize(10);
    doc.text(grade.fach || "-", 54, y + 7, { width: 92, ellipsis: true });
    doc.text(grade.typ || "-", 150, y + 7, { width: 106, ellipsis: true });
    doc.text(grade.bezeichnung || "-", 260, y + 7, { width: 126, ellipsis: true });
    doc.text(formatDate(grade.datum), 390, y + 7, { width: 70 });
    doc.text(String(grade.note ?? "-"), 460, y + 7, { width: 40, align: "center" });
    doc.text(String(grade.gewicht ?? "-"), 500, y + 7, { width: 40, align: "center" });
    doc.moveTo(50, y + 28).lineTo(545, y + 28).strokeColor("#E2EAE6").lineWidth(1).stroke();
  };

  let cursorY = 170;
  drawHeader(cursorY);
  cursorY += 28;
  sortedGrades.forEach((grade) => {
    if (cursorY > 770) {
      doc.addPage();
      cursorY = 60;
      drawHeader(cursorY);
      cursorY += 28;
    }
    drawRow(grade, cursorY);
    cursorY += 28;
  });

  doc.end();
}

module.exports = {
  buildAdminUsersCsv,
  buildEntriesCsv,
  renderPdf,
  renderGradesPdf
};
