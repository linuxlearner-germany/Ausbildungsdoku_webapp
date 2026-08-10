function slugify(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "") || fallback;
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",;\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function readErrorMessage(data, fallbackMessage) {
  if (typeof data?.error === "string") {
    return data.error;
  }

  if (data?.error?.message) {
    return data.error.message;
  }

  return fallbackMessage;
}

async function parseErrorResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return fallbackMessage;
  }

  try {
    const data = await response.json();
    return readErrorMessage(data, fallbackMessage);
  } catch (_error) {
    return fallbackMessage;
  }
}

function readFilename(response, fallbackFilename) {
  const disposition = response.headers.get("content-disposition") || "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = disposition.match(/filename="([^"]+)"/i);
  return plainMatch?.[1] || fallbackFilename;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium"
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function downloadEntriesCsv(entries, traineeName = "azubi") {
  const header = ["Datum", "Titel", "Betrieb", "Schule", "Status", "Kommentar", "Ablehnungsgrund"];
  const rows = (entries || [])
    .slice()
    .sort((left, right) => String(left.dateFrom).localeCompare(String(right.dateFrom)))
    .map((entry) => [
      entry.dateFrom || "",
      entry.weekLabel || "",
      entry.betrieb || "",
      entry.schule || "",
      entry.status || "",
      entry.trainerComment || "",
      entry.rejectionReason || ""
    ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `berichtsheft-${slugify(traineeName, "azubi")}.csv`);
}

export function downloadUsersCsv(users) {
  const header = ["Name", "Benutzername", "E-Mail", "Rolle", "Ausbildung", "Betrieb", "Berufsschule", "Ausbilder"];
  const rows = (users || []).map((user) => [
    user.name || "",
    user.username || "",
    user.email || "",
    user.role || "",
    user.ausbildung || "",
    user.betrieb || "",
    user.berufsschule || "",
    Array.isArray(user.trainerNames) ? user.trainerNames.join(", ") : ""
  ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "verwaltung-benutzer.csv");
}

export async function downloadFileFromApi(url, fallbackFilename, { errorMessage, method = "GET" } = {}) {
  const response = await fetch(url, {
    method,
    // API_BASE_URL darf auf einen anderen Origin zeigen. In diesem Fall
    // werden Sitzungs-Cookies nur mit `include` mitgesendet.
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response, errorMessage || "Datei konnte nicht geladen werden."));
  }

  const blob = await response.blob();
  downloadBlob(blob, readFilename(response, fallbackFilename));
}

export async function downloadPdfFromApi(url, fallbackFilename = "berichtsheft.pdf") {
  return downloadFileFromApi(url, fallbackFilename, {
    errorMessage: "PDF konnte nicht geladen werden."
  });
}

export async function downloadCsvFromApi(url, fallbackFilename = "berichtsheft.csv") {
  return downloadFileFromApi(url, fallbackFilename, {
    errorMessage: "CSV-Export konnte nicht gestartet werden."
  });
}

export async function downloadReportPdf({ entries, traineeName, trainingTitle }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable")
  ]);
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const sortedEntries = filterSignedReportEntries(entries).slice().sort((left, right) => String(left.dateFrom).localeCompare(String(right.dateFrom)));
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await loadImageData(assetUrl("/Pictures/logo-short.png")).catch(() => null);

  function drawHeader() {
    if (logo) doc.addImage(logo, "PNG", 14, 10, 48, 11.9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 101, 168);
    doc.setFontSize(16);
    doc.text("WIWEB Berichtsheft", 68, 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(68, 84, 106);
    doc.setFontSize(8.5);
    doc.text("Digitaler Ausbildungsnachweis", 68, 21);
    doc.setDrawColor(0, 101, 168);
    doc.line(14, 25, pageWidth - 14, 25);
  }

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setTextColor(23, 43, 58);
  doc.setFontSize(10.5);
  doc.text(`Name: ${traineeName || "-"}`, 14, 32);
  doc.text(`Ausbildung: ${trainingTitle || "-"}`, 14, 38);
  doc.text(`Stand: ${formatDateTime(new Date().toISOString())}`, 14, 44);

  autoTable(doc, {
    startY: 49,
    margin: { top: 30, left: 14, right: 14, bottom: 16 },
    head: [["Datum", "Titel", "Status", "Betrieb", "Berufsschule", "Kommentar"]],
    body: sortedEntries.length
      ? sortedEntries.map((entry) => [
          formatDate(entry.dateFrom),
          entry.weekLabel || "-",
          entry.status || "-",
          entry.betrieb || "-",
          entry.schule || "-",
          entry.rejectionReason || entry.trainerComment || entry.signerName || "-"
        ])
      : [["-", "Keine Berichte vorhanden", "-", "-", "-", "-"]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2.2,
      lineWidth: 0.15,
      lineColor: [214, 223, 218],
      textColor: [23, 34, 32],
      overflow: "linebreak"
    },
    headStyles: {
      fillColor: [31, 95, 87],
      textColor: [255, 255, 255],
      fontStyle: "bold"
    },
    alternateRowStyles: {
      fillColor: [246, 248, 247]
    },
    columnStyles: {
      0: { cellWidth: 23 },
      1: { cellWidth: 34 },
      2: { cellWidth: 22 },
      3: { cellWidth: 38 },
      4: { cellWidth: 38 },
      5: { cellWidth: 27 }
    },
    didDrawPage: drawHeader
  });

  doc.addPage();
  drawHeader();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Unterschriften", 14, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text("Hiermit wird bestätigt, dass die Berichtsheftführung geprüft wurde.", 14, 46);

  [
    { lineY: 82, label: "Unterschrift Azubi" },
    { lineY: 142, label: "Unterschrift Ausbilder" },
    { lineY: 202, label: "Unterschrift Erziehungsberechtigte/r" }
  ].forEach(({ lineY, label }) => {
    doc.line(14, lineY, 86, lineY);
    doc.line(105, lineY, pageWidth - 14, lineY);
    doc.text("Ort, Datum", 14, lineY + 6);
    doc.text(label, 105, lineY + 6);
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(93, 107, 120);
    doc.text(`WIWEB Berichtsheft · Seite ${page} von ${pageCount}`, pageWidth / 2, 290, { align: "center" });
  }

  doc.save(`berichtsheft-${slugify(traineeName, "azubi")}.pdf`);
}
import { assetUrl } from "./runtime.js";

export function filterSignedReportEntries(entries) {
  return (entries || []).filter((entry) => entry.status === "signed");
}

function loadImageData(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = reject;
    image.src = url;
  });
}
