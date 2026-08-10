import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectFile = (...segments) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");

test("Archiv verwendet semantische Spalten und den präzisen PDF-Download", () => {
  const source = projectFile("src", "pages", "ArchivPage.jsx");

  assert.match(source, /Freigegebene Berichte einsehen und als PDF exportieren\./);
  assert.match(source, /Gesamtes PDF herunterladen/);
  for (const className of ["archive-column-date", "archive-column-title", "archive-column-status", "archive-column-signer"]) {
    assert.match(source, new RegExp(className));
  }
});

test("Archiv-Tabelle bindet Bootstrap-Farben an zentrale Darkmode-Tokens", () => {
  const css = projectFile("src", "styles", "pages.css");

  assert.match(css, /\.archive-data-table\s*\{[\s\S]*?--bs-table-color:\s*var\(--text-primary\)/);
  assert.match(css, /\.archive-column-date,[\s\S]*?color:\s*var\(--text-secondary\)/);
  assert.match(css, /\.archive-column-title,[\s\S]*?color:\s*var\(--text-primary\)/);
  assert.doesNotMatch(css.match(/\.archive-page[\s\S]*?\.button-icon[\s\S]*?\}/)?.[0] || "", /color:\s*#(?:000|000000)\b/i);
});
