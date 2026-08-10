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
      async updateTrainerComment() {
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

test("Kommentar-Endpunkt aktualisiert nur den Kommentar und schreibt ein eigenes Audit-Ereignis", async () => {
  const updates = [];
  const auditLogs = [];
  const service = createReportService({
    reportRepository: {
      async findEntryWithOwnerById() {
        return { id: "submitted-1", trainee_id: 9, status: "submitted" };
      },
      async updateTrainerComment(entryId, comment) {
        updates.push({ entryId, comment });
        return 1;
      }
    },
    helpers: {
      async isTrainerAssignedToTrainee() {
        return true;
      },
      async writeAuditLog(payload) {
        auditLogs.push(payload);
      }
    }
  });

  const result = await service.commentEntry(
    { id: 4, role: "trainer" },
    "submitted-1",
    "  Fachlich vollständig.  "
  );

  assert.deepEqual(updates, [{ entryId: "submitted-1", comment: "Fachlich vollständig." }]);
  assert.equal(result.status, "submitted");
  assert.equal(result.trainerComment, "Fachlich vollständig.");
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].actionType, "REPORT_COMMENT_UPDATED");
  assert.notEqual(auditLogs[0].actionType, "REPORT_RETURNED");
});

test("Kommentar-Endpunkt meldet konkurrierend verarbeitete Berichte ohne Audit-Eintrag", async () => {
  const auditLogs = [];
  const service = createReportService({
    reportRepository: {
      async findEntryWithOwnerById() {
        return { id: "submitted-race", trainee_id: 9, status: "submitted" };
      },
      async updateTrainerComment() {
        return 0;
      }
    },
    helpers: {
      async isTrainerAssignedToTrainee() {
        return true;
      },
      async writeAuditLog(payload) {
        auditLogs.push(payload);
      }
    }
  });

  await assert.rejects(
    service.commentEntry({ id: 4, role: "trainer" }, "submitted-race", "Kommentar"),
    /inzwischen bereits verarbeitet/
  );
  assert.equal(auditLogs.length, 0);
});
