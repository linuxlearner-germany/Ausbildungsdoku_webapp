function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function parseIsoDate(value) {
  if (!isIsoDateString(value)) {
    return null;
  }

  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function minDate(left, right) {
  return left <= right ? left : right;
}

function normalizeEntryDates(entries = []) {
  return new Set(
    entries
      .map((entry) => String(entry?.dateFrom || "").trim())
      .filter((value) => parseIsoDate(value))
  );
}

function isWorkday(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function buildTrainingProgress({ trainingStartDate, trainingEndDate, entries = [], today = new Date() }) {
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = parseIsoDate(trainingStartDate);
  const endDate = parseIsoDate(trainingEndDate);
  const existingEntryDates = normalizeEntryDates(entries);

  if (!startDate) {
    return {
      available: false,
      message: "Ausbildungsbeginn nicht hinterlegt.",
      trainingStartDate: trainingStartDate || "",
      trainingEndDate: trainingEndDate || "",
      calculationUntil: "",
      requiredWorkdays: 0,
      existingReportDays: 0,
      missingReportDays: 0
    };
  }

  if (endDate && endDate < startDate) {
    return {
      available: false,
      message: "Ausbildungszeitraum ist ungueltig.",
      trainingStartDate,
      trainingEndDate,
      calculationUntil: "",
      requiredWorkdays: 0,
      existingReportDays: 0,
      missingReportDays: 0
    };
  }

  const calculationUntilDate = endDate ? minDate(endDate, normalizedToday) : normalizedToday;
  if (startDate > calculationUntilDate) {
    return {
      available: true,
      message: "",
      trainingStartDate,
      trainingEndDate: trainingEndDate || "",
      calculationUntil: formatIsoDate(calculationUntilDate),
      requiredWorkdays: 0,
      existingReportDays: 0,
      missingReportDays: 0
    };
  }

  let requiredWorkdays = 0;
  let existingReportDays = 0;

  for (const cursor = new Date(startDate); cursor <= calculationUntilDate; cursor.setDate(cursor.getDate() + 1)) {
    if (!isWorkday(cursor)) {
      continue;
    }

    requiredWorkdays += 1;
    if (existingEntryDates.has(formatIsoDate(cursor))) {
      existingReportDays += 1;
    }
  }

  return {
    available: true,
    message: "",
    trainingStartDate,
    trainingEndDate: trainingEndDate || "",
    calculationUntil: formatIsoDate(calculationUntilDate),
    requiredWorkdays,
    existingReportDays,
    missingReportDays: Math.max(0, requiredWorkdays - existingReportDays)
  };
}

module.exports = {
  isIsoDateString,
  parseIsoDate,
  buildTrainingProgress
};
