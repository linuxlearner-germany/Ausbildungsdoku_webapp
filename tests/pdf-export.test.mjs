import test from "node:test";
import assert from "node:assert/strict";
import exporters from "../utils/exporters.js";

test("Berichtsheft-PDF enthaelt alle vorgesehenen Unterschriftsfelder", () => {
  assert.deepEqual(exporters.REPORT_SIGNATURE_LABELS, [
    "Unterschrift Azubi",
    "Unterschrift Ausbilder",
    "Unterschrift Erziehungsberechtigte/r"
  ]);
});
