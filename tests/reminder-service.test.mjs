import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { localDateKey } = require("../services/reminder-service");

test("Erinnerungs-Deduplizierung verwendet den lokalen Kalendertag", () => {
  const date = new Date(2026, 6, 23, 17, 30, 0);
  assert.equal(localDateKey(date), "2026-07-23");
});
