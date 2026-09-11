import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const readProjectFile = (...segments) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

test("Web-Branding verwendet eine zentrale Logo-Komponente", () => {
  const sidebar = readProjectFile("src", "components", "SidebarNavigation.jsx");
  const login = readProjectFile("src", "pages", "LoginPage.jsx");
  const reset = readProjectFile("src", "pages", "PasswordResetPage.jsx");

  assert.match(sidebar, /<BrandLogo size="medium" variant="sidebar" \/>/);
  assert.match(login, /<BrandLogo size="large" variant="auth" \/>/);
  assert.match(reset, /<BrandLogo size="large" variant="auth" \/>/);
  assert.doesNotMatch(`${sidebar}${login}${reset}`, /className="sidebar-logo"/);
});

test("Logo-Groessen sind zentral und seitenverhaeltnistreu definiert", () => {
  const theme = readProjectFile("src", "styles", "theme.css");
  const components = readProjectFile("src", "styles", "components.css");

  assert.match(theme, /--brand-logo-sm:\s*24px/);
  assert.match(theme, /--brand-logo-md:\s*32px/);
  assert.match(theme, /--brand-logo-lg:\s*52px/);
  assert.match(components, /width:\s*auto/);
  assert.match(components, /object-fit:\s*contain/);
});

test("Sidebar gruppiert den neuen Produktnamen und Untertitel mit dem Logo", () => {
  const sidebar = readProjectFile("src", "components", "SidebarNavigation.jsx");

  assert.match(sidebar, /<strong>Berichtsheft<\/strong>/);
  assert.match(sidebar, /<small>Digitaler Ausbildungsnachweis<\/small>/);
  assert.doesNotMatch(sidebar, /<strong>WIWEB/);
});

test("Der bisherige Produktname bleibt aus sichtbaren Oberflaechen entfernt", () => {
  const visibleSources = [
    readProjectFile("src", "components", "SidebarNavigation.jsx"),
    readProjectFile("src", "pages", "LoginPage.jsx"),
    readProjectFile("src", "pages", "PasswordResetPage.jsx"),
    readProjectFile("public", "index.html"),
    readProjectFile("scripts", "build-github-pages.mjs")
  ].join("\n");

  assert.doesNotMatch(visibleSources, /Ausbildungsdoku/);
  assert.match(readProjectFile("src", "components", "BrandLogo.jsx"), /alt="WIWEB"/);
});
