import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isThemePreference,
  readStoredThemePreference,
  resolveTheme
} from "../src/lib/theme.mjs";

test("Theme-Praeferenzen werden korrekt validiert", () => {
  assert.equal(isThemePreference("light"), true);
  assert.equal(isThemePreference("dark"), true);
  assert.equal(isThemePreference("system"), true);
  assert.equal(isThemePreference("sepia"), false);
});

test("Theme-Aufloesung respektiert Systemmodus", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("Gespeicherte Theme-Praeferenz faellt sauber auf system zurueck", () => {
  const validStorage = {
    getItem(key) {
      return key === "berichtsheft-theme" ? "dark" : null;
    }
  };

  const invalidStorage = {
    getItem() {
      return "kaputt";
    }
  };

  assert.equal(readStoredThemePreference(validStorage), "dark");
  assert.equal(readStoredThemePreference(invalidStorage), "system");
  assert.equal(readStoredThemePreference(null), "system");
});

test("Dark-Mode-CSS definiert alle zentralen Flaechenvariablen", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "styles", "theme.css"), "utf8");
  const darkThemeBlock = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);

  assert.ok(darkThemeBlock, "Dark-Theme-Block fehlt in theme.css");

  const block = darkThemeBlock[1];
  for (const variableName of [
    "--app-bg",
    "--app-surface",
    "--app-surface-muted",
    "--app-border",
    "--app-text",
    "--app-muted",
    "--app-primary"
  ]) {
    assert.match(block, new RegExp(`${variableName}:\\s*[^;]+;`), `${variableName} fehlt im Dark-Theme-Block`);
  }
});

test("Dark-Mode-Surfaces und Wallpaper-Overlay bleiben dezent", () => {
  const themeCss = fs.readFileSync(path.join(process.cwd(), "src", "styles", "theme.css"), "utf8");
  const layoutCss = fs.readFileSync(path.join(process.cwd(), "src", "styles", "layout.css"), "utf8");
  const emptyState = fs.readFileSync(path.join(process.cwd(), "src", "components", "EmptyState.jsx"), "utf8");

  assert.match(themeCss, /--color-surface:\s*rgba\(24, 33, 47, 0\.94\)/);
  assert.match(themeCss, /--app-input-border:\s*#334155/);
  assert.match(layoutCss, /rgba\(10, 20, 35, 0\.18\)/);
  assert.doesNotMatch(emptyState, /bg-body|bg-white/);
});
