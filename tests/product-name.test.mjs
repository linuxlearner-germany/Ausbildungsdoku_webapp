import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const readProjectFile = (...segments) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

const visibleProductFiles = [
  ["src", "components", "SidebarNavigation.jsx"],
  ["src", "pages", "LoginPage.jsx"],
  ["src", "pages", "PasswordResetPage.jsx"],
  ["src", "pages", "EmailRelaySettingsPage.jsx"],
  ["services", "auth-service.js"],
  ["services", "admin-service.js"],
  ["services", "reminder-service.js"],
  ["src", "lib", "reportExport.js"],
  ["utils", "exporters.js"],
  ["public", "index.html"],
  ["scripts", "build-github-pages.mjs"]
];

test("sichtbare Produktoberflaechen verwenden WIWEB Berichtsheft", () => {
  const source = visibleProductFiles.map((segments) => readProjectFile(...segments)).join("\n");

  assert.match(source, /WIWEB Berichtsheft/);
  assert.doesNotMatch(source, /Ausbildungsdoku/);
  assert.doesNotMatch(source, /Digitales Berichtsheft/);
});

test("README-Einleitung nennt den neuen Produktnamen", () => {
  const introduction = readProjectFile("README.md").split("\n").slice(0, 12).join("\n");

  assert.match(introduction, /^# WIWEB Berichtsheft/m);
  assert.match(introduction, /digitaler Ausbildungsnachweis/i);
  assert.doesNotMatch(introduction, /Ausbildungsdoku/);
});

test("Sidebar und Login verwenden den neuen Untertitel", () => {
  const source = [
    readProjectFile("src", "components", "SidebarNavigation.jsx"),
    readProjectFile("src", "pages", "LoginPage.jsx")
  ].join("\n");

  assert.equal((source.match(/Digitaler Ausbildungsnachweis/g) || []).length, 2);
});
