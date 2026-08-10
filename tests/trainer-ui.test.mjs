import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectFile = (...segments) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

test("Ausbilder-Dashboard priorisiert den unveraenderten Vierer-KPI-Satz und die Arbeitswege", () => {
  const source = projectFile("src", "pages", "DashboardPage.jsx");
  const trainerStart = source.indexOf('if (role === "trainer")');
  const trainerEnd = source.indexOf('\n  return (\n    <div className="page-stack">', trainerStart);
  const trainerView = source.slice(trainerStart, trainerEnd);

  assert.match(trainerView, /trainer-dashboard-kpis/);
  assert.equal((trainerView.match(/<StatCard/g) || []).length, 4);
  for (const label of ["Azubis", "Offene Prüfungen", "Signiert", "Abgelehnt"]) {
    assert.match(trainerView, new RegExp(`label="${label}"`));
  }
  assert.match(trainerView, /priority=\{submittedCount > 0\}/);
  assert.match(trainerView, /actions=\{<Link[^>]*to="\/freigaben">Freigaben öffnen<\/Link>\}/);
  assert.match(source, /const TRAINER_QUICK_ACTIONS = \[[\s\S]*?\/freigaben[\s\S]*?\/noten[\s\S]*?\/archiv[\s\S]*?\/profil/);
  assert.match(trainerView, /trainer-trainee-list/);
});

test("Ausbilder-Notenansicht verwendet eine kompakte Auswahl und behaelt Leserechte bei", () => {
  const source = projectFile("src", "pages", "NotenPage.jsx");

  assert.match(source, /const canManageGrades = role === "trainee" \|\| role === "admin";/);
  assert.match(source, /trainer-grade-target-toolbar/);
  assert.match(source, /trainerHasNoGrades/);
  assert.match(source, /<EmptyState[\s\S]*?size="compact"/);
  assert.match(source, /Nur lesen/);
});

test("Freigabenfilter ist zweispaltig, zugaenglich und behaelt alle Aktionen", () => {
  const source = projectFile("src", "pages", "FreigabenPage.jsx");
  const css = projectFile("src", "styles", "pages.css");

  assert.match(source, /<FilterBar className="approval-filter-bar" label="Freigaben filtern">/);
  assert.match(source, /type="search"/);
  for (const label of ["Freigaben durchsuchen", "Nach Status filtern", "Nach Azubi filtern"]) {
    assert.match(source, new RegExp(`aria-label="${label}"`));
  }
  assert.match(css, /\.approval-filter-bar\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.approval-filter-bar > input:first-child\s*\{[^}]*grid-column:1 \/ -1/);
  for (const action of ["Kommentar speichern", "Freigeben", "Zur Nachbearbeitung zurückgeben", "PDF"]) {
    assert.match(source, new RegExp(action));
  }
  assert.match(source, /onComment\(selectedEntry\.id, comment\)/);
  assert.match(source, /runDecisionAction\("sign", \(\) => onSign\(selectedEntry\.id\)\)/);
  assert.match(source, /runDecisionAction\("reject", \(\) => onReject\(selectedEntry\.id, reason\)\)/);
  assert.match(source, /setSelected\(nextOpenEntry\?\.id \|\| null\)/);
  assert.doesNotMatch(source, /onSign\(selectedEntry\.id, comment\)/);
});

test("Gemeinsamer Empty State bietet eine explizite kompakte Variante", () => {
  const source = projectFile("src", "components", "EmptyState.jsx");
  const css = projectFile("src", "styles", "system.css");

  assert.match(source, /size = "default"/);
  assert.match(source, /size === "compact" \? " empty-state--compact"/);
  assert.match(css, /\.empty-state--compact\s*\{[^}]*min-height:4\.75rem/);
});

test("Darstellungseinstellungen zeigen alle Hintergruende in einem kompakten Desktop-Raster", () => {
  const source = projectFile("src", "pages", "ProfilPage.jsx");
  const css = projectFile("src", "styles", "pages.css");

  assert.match(source, /className="background-grid" role="group"/);
  assert.match(source, /BACKGROUND_REGISTRY\.map/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /background\.path \?/);
  assert.match(css, /\.display-settings-panel \.background-grid\s*\{[^}]*repeat\(3,minmax\(0,1fr\)\)/);
});

test("Archiv behaelt PDF-Aktion und stabile Desktop-Tabelle", () => {
  const source = projectFile("src", "pages", "ArchivPage.jsx");
  const css = projectFile("src", "styles", "pages.css");

  assert.match(source, /Gesamtes PDF herunterladen/);
  assert.match(source, /archive-data-table-managed/);
  assert.match(css, /\.archive-data-table-managed\s*\{[^}]*min-width:760px/);
  assert.match(css, /\.archive-data-table tbody td\s*\{[^}]*height:3\.5rem/);
});
