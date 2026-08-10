import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKGROUND_REGISTRY,
  BACKGROUND_STORAGE_KEY,
  DEFAULT_BACKGROUND,
  getBackgroundPath,
  isBackgroundPreference,
  readStoredBackgroundPreference,
  saveStoredBackgroundPreference
} from "../src/lib/background.mjs";

function memoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(BACKGROUND_STORAGE_KEY, initialValue);
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

test("Hintergrund-Registry enthaelt eindeutige, gueltige Schluessel", () => {
  const keys = BACKGROUND_REGISTRY.map((background) => background.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys, [
    "none", "standard", "modern", "modern-logo", "wiweb", "wiweb-circle",
    "alternative-1", "alternative-2", "windows-1", "windows-2", "windows-3", "windows-4"
  ]);
  assert.equal(isBackgroundPreference("standard"), true);
  assert.equal(isBackgroundPreference("veraltet"), false);
  assert.equal(DEFAULT_BACKGROUND, "standard");
  assert.match(getBackgroundPath("alternative-1"), /\.jpg$/);
});

test("Hintergrund wird gespeichert und wiederhergestellt", () => {
  const storage = memoryStorage();
  assert.equal(saveStoredBackgroundPreference(storage, "wiweb"), "wiweb");
  assert.equal(readStoredBackgroundPreference(storage), "wiweb");
});

test("Ungueltige LocalStorage-Werte werden auf Standard zurueckgesetzt", () => {
  const storage = memoryStorage("alter-hintergrund");
  assert.equal(readStoredBackgroundPreference(storage), "standard");
  assert.equal(storage.getItem(BACKGROUND_STORAGE_KEY), "standard");
  assert.equal(readStoredBackgroundPreference(null), "standard");
});

test("Kein Hintergrund erzeugt keinen Bildpfad", () => {
  assert.equal(getBackgroundPath("none", 1920), null);
});

test("Modern mit Logo waehlt die passende Aufloesung", () => {
  assert.equal(getBackgroundPath("modern-logo", 1920), "/Pictures/Backgrounds/desktop-full-hd-modern-logo-rechts.png");
  assert.equal(getBackgroundPath("modern-logo", 2560), "/Pictures/Backgrounds/desktop-2560-modern-logo-rechts.png");
  assert.equal(getBackgroundPath("modern-logo", 3840), "/Pictures/Backgrounds/desktop-4k-modern-logo-rechts.png");
});

test("Theme- und Hintergrundspeicher bleiben unabhaengig", () => {
  const storage = memoryStorage();
  storage.setItem("berichtsheft-theme", "dark");
  saveStoredBackgroundPreference(storage, "windows-2");
  assert.equal(storage.getItem("berichtsheft-theme"), "dark");
  assert.equal(readStoredBackgroundPreference(storage), "windows-2");
});
