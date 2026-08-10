import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const readProjectFile = (...segments) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

test("Web-Branding verwendet eine zentrale Logo-Komponente", () => {
  const sidebar = readProjectFile("src", "components", "SidebarNavigation.jsx");
  const login = readProjectFile("src", "pages", "LoginPage.jsx");
  const reset = readProjectFile("src", "pages", "PasswordResetPage.jsx");

  assert.match(sidebar, /<BrandLogo size="medium" \/>/);
  assert.match(login, /<BrandLogo size="large" \/>/);
  assert.match(reset, /<BrandLogo size="large" \/>/);
  assert.doesNotMatch(`${sidebar}${login}${reset}`, /className="sidebar-logo"/);
});

test("Logo-Groessen sind zentral und seitenverhaeltnistreu definiert", () => {
  const theme = readProjectFile("src", "styles", "theme.css");
  const components = readProjectFile("src", "styles", "components.css");

  assert.match(theme, /--brand-logo-sm:\s*24px/);
  assert.match(theme, /--brand-logo-md:\s*32px/);
  assert.match(theme, /--brand-logo-lg:\s*44px/);
  assert.match(components, /width:\s*auto/);
  assert.match(components, /object-fit:\s*contain/);
});

test("Sidebar gruppiert Produktname und Untertitel mit dem Logo", () => {
  const sidebar = readProjectFile("src", "components", "SidebarNavigation.jsx");

  assert.match(sidebar, /<strong>Ausbildungsdoku<\/strong>/);
  assert.match(sidebar, /<small>Digitales Berichtsheft<\/small>/);
});
