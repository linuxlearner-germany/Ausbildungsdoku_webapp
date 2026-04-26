import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
    credentials: "same-origin"
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

export function downloadReportPdf({ entries, traineeName, trainingTitle }) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const sortedEntries = (entries || []).slice().sort((left, right) => String(left.dateFrom).localeCompare(String(right.dateFrom)));
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Berichtsheft", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Name: ${traineeName || "-"}`, 14, 27);
  doc.text(`Ausbildung: ${trainingTitle || "-"}`, 14, 33);
  doc.text(`Stand: ${formatDateTime(new Date().toISOString())}`, 14, 39);
  doc.line(14, 43, pageWidth - 14, 43);

  autoTable(doc, {
    startY: 48,
    margin: { left: 14, right: 14 },
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
    }
  });

  doc.save(`berichtsheft-${slugify(traineeName, "azubi")}.pdf`);
}
