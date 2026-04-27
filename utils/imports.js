const XLSX = require("xlsx");
const crypto = require("crypto");

function toIsoDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseImportedDate(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d && isValidDateParts(parsed.y, parsed.m, parsed.d)) {
      return toIsoDateParts(parsed.y, parsed.m, parsed.d);
    }
  }

  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return isValidDateParts(year, month, day) ? raw : "";
  }

  const dotted = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dotted) {
    const year = Number(dotted[3]);
    const month = Number(dotted[2]);
    const day = Number(dotted[1]);
    return isValidDateParts(year, month, day) ? toIsoDateParts(year, month, day) : "";
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    return isValidDateParts(year, month, day) ? toIsoDateParts(year, month, day) : "";
  }

  return "";
}

function normalizeImportedRole(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["trainee", "azubi", "apprentice"].includes(raw)) return "trainee";
  if (["trainer", "ausbilder"].includes(raw)) return "trainer";
  if (raw === "admin") return "admin";
  return "";
}

function parseTrainerUsernames(value, normalizeUsername) {
  return [...new Set(
    String(value || "")
      .split("|")
      .map((item) => normalizeUsername(item))
      .filter(Boolean)
  )];
}

function generateImportPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

function parseImportRows(filename, contentBase64) {
  if (!filename || !contentBase64) {
    return { error: "Dateiinhalt fehlt." };
  }

  const buffer = Buffer.from(String(contentBase64), "base64");
  if (!buffer.length) {
    return { error: "Datei konnte nicht gelesen werden." };
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (_error) {
    return { error: "Datei konnte nicht verarbeitet werden. Bitte eine gueltige .xlsx- oder .csv-Datei verwenden." };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { error: "Die Datei enthaelt kein Tabellenblatt." };
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, defval: "", raw: true });
  if (!rows.length) {
    return { error: "Die Datei enthaelt keine Daten." };
  }

  return { rows };
}

function detectColumns(headerRow, aliases) {
  const mapping = {};
  const normalizedHeader = headerRow.map((cell) =>
    String(cell || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
  );

  Object.entries(aliases).forEach(([field, values]) => {
    const index = normalizedHeader.findIndex((item) => values.includes(item));
    if (index >= 0) {
      mapping[field] = index;
    }
  });

  return mapping;
}

function detectImportColumns(headerRow) {
  return detectColumns(headerRow, {
    dateFrom: ["datum", "tag", "date", "datefrom"],
    weekLabel: ["titel", "title", "bericht", "weeklabel", "bezeichnung"],
    betrieb: ["betrieb", "arbeit", "work"],
    schule: ["berufsschule", "schule", "school", "unterricht"]
  });
}

function detectUserImportColumns(headerRow) {
  return detectColumns(headerRow, {
    name: ["name", "fullname", "vollername"],
    username: ["username", "benutzername", "login"],
    email: ["email", "mail", "emailadresse"],
    role: ["role", "rolle"],
    password: ["password", "passwort", "kennwort"],
    ausbildung: ["ausbildung", "education", "training"],
    betrieb: ["betrieb", "company", "unternehmen"],
    berufsschule: ["berufsschule", "schule", "school"],
    trainerUsernames: ["trainerusernames", "trainer", "ausbilder", "ausbilderusernames", "trainerusername"],
    ausbildungsStart: ["ausbildungsbeginn", "ausbildungsstart", "trainingstartdate", "trainingstart", "startdate"],
    ausbildungsEnde: ["ausbildungsende", "trainingenddate", "trainingend", "enddate"]
  });
}

module.exports = {
  toIsoDateParts,
  isValidDateParts,
  parseImportedDate,
  normalizeImportedRole,
  parseTrainerUsernames,
  generateImportPassword,
  parseImportRows,
  detectImportColumns,
  detectUserImportColumns
};
