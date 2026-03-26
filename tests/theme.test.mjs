import test from "node:test";
import assert from "node:assert/strict";
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
