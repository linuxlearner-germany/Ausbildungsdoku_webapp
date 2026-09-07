import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const readProjectFile = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");

test("Admin-Relay-Seite bietet einen zugaenglichen HTML-Formatumschalter", () => {
  const source = readProjectFile("src", "pages", "EmailRelaySettingsPage.jsx");
  assert.match(source, /HTML-E-Mails aktivieren/);
  assert.match(source, /role="switch"/);
  assert.match(source, /aria-checked=\{form\.htmlEnabled\}/);
  assert.match(source, /Klartext wird immer mitgesendet/);
  assert.match(source, /HTML mit Klartext-Fallback/);
  assert.match(source, /Nur Klartext/);
});

test("HTML-Mail-Migration setzt einen verpflichtenden Standardwert true", () => {
  const migration = readProjectFile("data", "migrations", "20260810170000_add_email_html_enabled.js");
  assert.match(migration, /boolean\("html_enabled"\)\.notNullable\(\)\.defaultTo\(true\)/);
  assert.doesNotMatch(migration, /createTable/);
});
