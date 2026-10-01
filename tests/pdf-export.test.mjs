import test from "node:test";
import assert from "node:assert/strict";
import exporters from "../utils/exporters.js";
import fs from "node:fs";

test("Berichtsheft-PDF enthaelt alle vorgesehenen Unterschriftsfelder", () => {
  assert.deepEqual(exporters.REPORT_SIGNATURE_LABELS, [
    "Unterschrift Azubi",
    "Unterschrift Ausbilder",
    "Unterschrift Erziehungsberechtigte/r"
  ]);
});

test("Server-Berichtsheft-PDF nutzt Wortlogo, Untertitel und Seitenzahlen", () => {
  const source = fs.readFileSync(new URL("../utils/exporters.js", import.meta.url), "utf8");
  const reportRenderer = source.slice(source.indexOf("function renderPdf"), source.indexOf("function renderGradesPdf"));

  assert.match(reportRenderer, /logo-short\.png/);
  assert.match(reportRenderer, /Digitaler Ausbildungsnachweis/);
  assert.match(reportRenderer, /bufferPages: true/);
  assert.match(reportRenderer, /Seite \$\{index \+ 1\} von \$\{range\.count\}/);
  assert.match(reportRenderer, /entry\.status === "signed"/);
});

test("Browser-Berichtsheft-PDF filtert signierte Berichte und erhaelt Unterschriften", () => {
  const source = fs.readFileSync(new URL("../src/lib/reportExport.js", import.meta.url), "utf8");

  assert.match(source, /filterSignedReportEntries\(entries\)/);
  assert.match(source, /Pictures\/logo-short\.png/);
  assert.match(source, /Digitaler Ausbildungsnachweis/);
  assert.match(source, /Unterschrift Azubi/);
  assert.match(source, /Unterschrift Ausbilder/);
  assert.match(source, /Unterschrift Erziehungsberechtigte\/r/);
  assert.match(source, /Seite \$\{page\} von \$\{pageCount\}/);
});
