/**
 * @typedef {"Schulaufgabe" | "Stegreifaufgabe"} GradeType
 */

/**
 * @typedef {Object} GradeEntry
 * @property {number | string | null} [id]
 * @property {string} fach
 * @property {GradeType | string} typ
 * @property {string} bezeichnung
 * @property {string} datum
 * @property {number | string} note
 * @property {number | string} [gewicht]
 */

/**
 * @typedef {GradeEntry & { gewicht: number, note: number }} NormalizedGradeEntry
 */

/**
 * @typedef {Object} SubjectGradeGroup
 * @property {string} fach
 * @property {NormalizedGradeEntry[]} entries
 * @property {number | null} average
 * @property {number} count
 * @property {number} totalWeight
 * @property {number} schulaufgaben
 * @property {number} stegreifaufgaben
 */

export const GRADE_TYPES = [
  { value: "Schulaufgabe", weight: 2 },
  { value: "Stegreifaufgabe", weight: 1 }
];

export function getWeight(type) {
  return type === "Schulaufgabe" ? 2 : 1;
}

export function gradeWeight(type) {
  return getWeight(type);
}

export function getGradeColor(grade) {
  const note = Number(grade);

  if (note <= 2) {
    return {
      tone: "good",
      className: "grade-good",
      background: "#d9efe5",
      text: "#1f6e53",
      border: "#abd3c0"
    };
  }

  if (note >= 4.5) {
    return {
      tone: "critical",
      className: "grade-critical",
      background: "#f5d4d0",
      text: "#8d3c33",
      border: "#e6aca5"
    };
  }

  return {
    tone: "neutral",
    className: "grade-neutral",
    background: "#e7ece6",
    text: "#54625c",
    border: "#cbd5d0"
  };
}

export function gradeTone(note) {
  return getGradeColor(note).tone;
}

export function formatGrade(note) {
  return Number(note).toLocaleString("de-DE", {
    minimumFractionDigits: Number.isInteger(Number(note)) ? 0 : 1,
    maximumFractionDigits: 2
  });
}

export function formatGradeDate(value) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-");
    return `${day}.${month}.${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * @param {GradeEntry} entry
 * @returns {NormalizedGradeEntry}
 */
export function normalizeGradeEntry(entry) {
  return {
    ...entry,
    fach: String(entry?.fach || "").trim(),
    typ: String(entry?.typ || "").trim(),
    bezeichnung: String(entry?.bezeichnung || "").trim(),
    datum: String(entry?.datum || "").trim(),
    note: Number(entry?.note),
    gewicht: getWeight(entry?.typ)
  };
}

export function sortGradesByDateDesc(entries) {
  return [...entries].sort((left, right) => {
    const bySubject = String(left.fach || "").localeCompare(String(right.fach || ""), "de");
    if (bySubject !== 0) {
      return bySubject;
    }

    const byDate = String(right.datum || "").localeCompare(String(left.datum || ""));
    if (byDate !== 0) {
      return byDate;
    }

    return Number(right.id || 0) - Number(left.id || 0);
  });
}

export function calculateWeightedAverage(entries) {
  if (!entries.length) return null;

  const normalizedEntries = entries.map(normalizeGradeEntry).filter((entry) => entry.fach && Number.isFinite(entry.note));
  if (!normalizedEntries.length) return null;

  const totalWeight = normalizedEntries.reduce((sum, entry) => sum + getWeight(entry.typ), 0);
  if (!totalWeight) return null;

  const weightedSum = normalizedEntries.reduce((sum, entry) => sum + entry.note * getWeight(entry.typ), 0);
  return weightedSum / totalWeight;
}

export function groupGradesBySubject(entries) {
  const grouped = entries
    .map(normalizeGradeEntry)
    .filter((entry) => entry.fach && Number.isFinite(entry.note))
    .reduce((map, entry) => {
      if (!map.has(entry.fach)) {
        map.set(entry.fach, []);
      }

      map.get(entry.fach).push(entry);
      return map;
    }, new Map());

  return Array.from(grouped.entries())
    .map(([fach, subjectEntries]) => {
      const sortedEntries = [...subjectEntries].sort((left, right) => {
        const byDate = String(right.datum || "").localeCompare(String(left.datum || ""));
        if (byDate !== 0) {
          return byDate;
        }

        return Number(right.id || 0) - Number(left.id || 0);
      });

      return {
        fach,
        entries: sortedEntries,
        average: calculateWeightedAverage(sortedEntries),
        count: sortedEntries.length,
        totalWeight: sortedEntries.reduce((sum, entry) => sum + entry.gewicht, 0),
        schulaufgaben: sortedEntries.filter((entry) => entry.typ === "Schulaufgabe").length,
        stegreifaufgaben: sortedEntries.filter((entry) => entry.typ === "Stegreifaufgabe").length
      };
    })
    .filter((group) => group.count > 0)
    .sort((left, right) => left.fach.localeCompare(right.fach, "de"));
}

export function getGradeStatistics(entries) {
  const normalizedEntries = entries.map(normalizeGradeEntry).filter((entry) => entry.fach && Number.isFinite(entry.note));
  const groups = groupGradesBySubject(normalizedEntries);

  if (!normalizedEntries.length) {
    return {
      overallAverage: null,
      bestGrade: null,
      worstGrade: null,
      subjectCount: 0,
      totalEntries: 0
    };
  }

  const sortedByGrade = [...normalizedEntries].sort((left, right) => left.note - right.note);

  return {
    overallAverage: calculateWeightedAverage(normalizedEntries),
    bestGrade: sortedByGrade[0]?.note ?? null,
    worstGrade: sortedByGrade.at(-1)?.note ?? null,
    subjectCount: groups.length,
    totalEntries: normalizedEntries.length
  };
}

export function summarizeGrades(grades) {
  return groupGradesBySubject(grades).map((group) => ({
    fach: group.fach,
    average: group.average,
    schulaufgaben: group.schulaufgaben,
    stegreifaufgaben: group.stegreifaufgaben,
    count: group.count
  }));
}
