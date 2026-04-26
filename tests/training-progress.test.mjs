import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildTrainingProgress } = require("../utils/training-progress");

test("Fehlende Berichtstage zaehlen nur Werktage und ignorieren doppelte Tage", () => {
  const result = buildTrainingProgress({
    trainingStartDate: "2026-04-20",
    trainingEndDate: "2026-04-30",
    today: new Date("2026-04-26T10:00:00"),
    entries: [
      { dateFrom: "2026-04-20" },
      { dateFrom: "2026-04-21" },
      { dateFrom: "2026-04-21" },
      { dateFrom: "2026-04-25" }
    ]
  });

  assert.equal(result.available, true);
  assert.equal(result.calculationUntil, "2026-04-26");
  assert.equal(result.requiredWorkdays, 5);
  assert.equal(result.existingReportDays, 2);
  assert.equal(result.missingReportDays, 3);
});

test("Fehlender Ausbildungsbeginn liefert Hinweis statt Fehler", () => {
  const result = buildTrainingProgress({
    trainingStartDate: "",
    trainingEndDate: "2026-12-31",
    entries: []
  });

  assert.equal(result.available, false);
  assert.equal(result.message, "Ausbildungsbeginn nicht hinterlegt.");
  assert.equal(result.missingReportDays, 0);
});

test("Zukuenftiger Ausbildungsbeginn fuehrt zu null fehlenden Berichtstagen", () => {
  const result = buildTrainingProgress({
    trainingStartDate: "2026-05-01",
    trainingEndDate: "2027-05-01",
    today: new Date("2026-04-26T10:00:00"),
    entries: []
  });

  assert.equal(result.available, true);
  assert.equal(result.missingReportDays, 0);
  assert.equal(result.requiredWorkdays, 0);
  assert.equal(result.calculationUntil, "2026-04-26");
});
