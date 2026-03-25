import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCalendarGridDates,
  buildLocalWeekDates,
  createLocalDate,
  formatLocalDate,
  getMondayBasedDayIndex,
  getTodayLocalDateString,
  parseLocalDate,
  toLocalDateString
} from "../src/lib/date.mjs";

test("Lokale Tagesstrings bleiben beim Parsen stabil", () => {
  assert.equal(toLocalDateString(parseLocalDate("2026-03-24")), "2026-03-24");
  assert.equal(toLocalDateString(parseLocalDate("2026-01-01")), "2026-01-01");
});

test("Montag-Offset fuer JS-Wochentage wird korrekt berechnet", () => {
  assert.equal(getMondayBasedDayIndex(createLocalDate(2024, 8, 1)), 6);
  assert.equal(getMondayBasedDayIndex(createLocalDate(2024, 3, 1)), 0);
  assert.equal(getMondayBasedDayIndex(createLocalDate(2024, 5, 1)), 5);
});

test("Kalendergitter fuer Monatsanfang Sonntag startet auf dem Montag der Vorwoche", () => {
  const dates = buildCalendarGridDates("2024-09-01");
  assert.equal(dates[0], "2024-08-26");
  assert.equal(dates[6], "2024-09-01");
});

test("Kalendergitter fuer Monatsanfang Montag startet direkt am Monatsersten", () => {
  const dates = buildCalendarGridDates("2024-04-01");
  assert.equal(dates[0], "2024-04-01");
  assert.equal(dates[6], "2024-04-07");
});

test("Kalendergitter fuer Monatsanfang Samstag startet korrekt am Montag davor", () => {
  const dates = buildCalendarGridDates("2024-06-01");
  assert.equal(dates[0], "2024-05-27");
  assert.equal(dates[5], "2024-06-01");
});

test("Wochenberechnung bleibt ueber Monats- und Jahreswechsel stabil", () => {
  assert.deepEqual(buildLocalWeekDates("2025-12-31"), [
    "2025-12-29",
    "2025-12-30",
    "2025-12-31",
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
    "2026-01-04"
  ]);
  assert.deepEqual(buildLocalWeekDates("2026-03-01"), [
    "2026-02-23",
    "2026-02-24",
    "2026-02-25",
    "2026-02-26",
    "2026-02-27",
    "2026-02-28",
    "2026-03-01"
  ]);
});

test("Berichtsdatum X erscheint im Gitter exakt auf Datum X", () => {
  const dates = buildCalendarGridDates("2026-03-01");
  assert.ok(dates.includes("2026-03-24"));
  assert.equal(dates[29], "2026-03-24");
});

test("Heute-Markierung nutzt einen lokalen Tagesstring", () => {
  const today = getTodayLocalDateString();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(toLocalDateString(parseLocalDate(today)), today);
});

test("Lokale Datumsformatierung verwendet den korrekten Kalendertag", () => {
  assert.equal(formatLocalDate("2026-03-24", { day: "2-digit", month: "2-digit", year: "numeric" }), "24.03.2026");
});
