import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createReportService } = require("../services/report-service");

test("Kommentar-Endpunkt kann keinen Entwurf zurueckgeben", async () => {
  let updateCalled = false;
  const service = createReportService({
    reportRepository: {
      async findEntryWithOwnerById() {
        return { id: "draft-1", trainee_id: 9, status: "draft" };
      },
      async rejectEntryWithComment() {
        updateCalled = true;
        return 1;
      }
    },
    helpers: {
      async isTrainerAssignedToTrainee() {
        return true;
      },
      async writeAuditLog() {}
    }
  });

  await assert.rejects(
    service.commentEntry({ id: 4, role: "trainer" }, "draft-1", "Bitte pruefen"),
    /Nur eingereichte Eintraege/
  );
  assert.equal(updateCalled, false);
});
