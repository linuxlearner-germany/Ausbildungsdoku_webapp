export const GRADE_TYPES = [
  { value: "Schulaufgabe", weight: 2 },
  { value: "Stegreifaufgabe", weight: 1 }
];

export function gradeWeight(type) {
  return type === "Schulaufgabe" ? 2 : 1;
}

export function gradeTone(note) {
  if (note <= 2) return "good";
  if (note >= 4.5) return "critical";
  return "neutral";
}

export function formatGrade(note) {
  return Number(note).toLocaleString("de-DE", {
    minimumFractionDigits: Number.isInteger(Number(note)) ? 0 : 1,
    maximumFractionDigits: 2
  });
}

export function calculateWeightedAverage(grades) {
  if (!grades.length) return null;
  const totalWeight = grades.reduce((sum, grade) => sum + grade.gewicht, 0);
  if (!totalWeight) return null;
  const weightedSum = grades.reduce((sum, grade) => sum + Number(grade.note) * Number(grade.gewicht), 0);
  return weightedSum / totalWeight;
}

export function summarizeGrades(grades) {
  const bySubject = grades.reduce((map, grade) => {
    if (!map.has(grade.fach)) {
      map.set(grade.fach, []);
    }
    map.get(grade.fach).push(grade);
    return map;
  }, new Map());

  return Array.from(bySubject.entries())
    .map(([fach, subjectGrades]) => ({
      fach,
      average: calculateWeightedAverage(subjectGrades),
      schulaufgaben: subjectGrades.filter((grade) => grade.typ === "Schulaufgabe").length,
      stegreifaufgaben: subjectGrades.filter((grade) => grade.typ === "Stegreifaufgabe").length,
      count: subjectGrades.length
    }))
    .sort((a, b) => a.fach.localeCompare(b.fach, "de"));
}
