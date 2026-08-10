import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const readProjectFile = (...segments) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

test("Azubi-Dashboard priorisiert vier handlungsrelevante KPIs", () => {
  const source = readProjectFile("src", "pages", "DashboardPage.jsx");
  const traineeSection = source.slice(source.indexOf('if (role === "trainee")'), source.indexOf('if (role === "trainer")'));

  assert.equal((traineeSection.match(/<StatCard/g) || []).length, 4);
  for (const label of ["Berichtstage", "Offen / in Prüfung", "Fehlende Berichtstage", "Notenschnitt"]) {
    assert.match(traineeSection, new RegExp(`label="${label.replace("/", "\\/")}"`));
  }
  assert.doesNotMatch(traineeSection, /label="Signiert"/);
});

test("Pflichtzeitraum berechnet Fortschritt dynamisch und zeigt sechs Metadaten", () => {
  const source = readProjectFile("src", "pages", "DashboardPage.jsx");
  const styles = readProjectFile("src", "styles", "pages.css");

  assert.match(source, /existingReportDays\s*\/\s*requiredReportDays/);
  assert.match(source, /role="progressbar"/);
  assert.match(source, /aria-valuenow=\{Math\.round\(reportingPercentage\)\}/);
  assert.match(styles, /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
});

test("Dashboard bietet sechs kompakte Schnellzugriffe", () => {
  const source = readProjectFile("src", "pages", "DashboardPage.jsx");
  const actionBlock = source.slice(source.indexOf("const QUICK_ACTIONS"), source.indexOf("const TRAINER_QUICK_ACTIONS"));

  assert.equal((actionBlock.match(/\{ to:/g) || []).length, 6);
  for (const title of ["Bericht schreiben", "Kalenderansicht", "Noten", "Freigabestatus", "Profil", "Archiv"]) {
    assert.match(actionBlock, new RegExp(`title: "${title}"`));
  }
});
