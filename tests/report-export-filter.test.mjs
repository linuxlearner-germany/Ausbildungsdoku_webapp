import test from "node:test";
import assert from "node:assert/strict";
import { filterSignedReportEntries } from "../src/lib/reportExport.js";

test("Browser-PDF übernimmt ausschließlich signierte Berichte", () => {
  const entries = [
    { id: 1, status: "draft" },
    { id: 2, status: "submitted" },
    { id: 3, status: "signed" }
  ];
  assert.deepEqual(filterSignedReportEntries(entries), [entries[2]]);
  assert.deepEqual(filterSignedReportEntries(), []);
});
