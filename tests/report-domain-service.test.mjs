import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createReportDomainService } = require("../services/report-domain-service");

function createService({ reportRepository = {}, sharedRepository = {}, writeAuditLog = async () => {} }) {
  return createReportDomainService({
    reportRepository,
    sharedRepository,
    normalizeEntry: (value) => value,
    parseImportRows: () => ({ rows: [] }),
    detectImportColumns: () => ({}),
    parseImportedDate: () => "",
    writeAuditLog
  });
}

await test("submitReportEntryForTrainee lehnt signierte Eintraege ab", async () => {
  const service = createService({
    reportRepository: {
      async findEntryForSubmission() {
        return {
          id: "entry-1",
          weekLabel: "Bericht",
          dateFrom: "2026-04-01",
          dateTo: "2026-04-01",
          betrieb: "Werkstatt",
          schule: "",
          status: "signed"
        };
      }
    }
  });

  const result = await service.submitReportEntryForTrainee({ id: 11 }, "entry-1");
  assert.equal(result.error, "Signierte Einträge koennen nicht erneut eingereicht werden.");
});

await test("signReportEntryForActor erlaubt nur eingereichte Eintraege", async () => {
  const service = createService({
    sharedRepository: {
      async findEntryWithOwnerById() {
        return {
          id: "entry-2",
          weekLabel: "Bericht",
          dateFrom: "2026-04-02",
          dateTo: "2026-04-02",
          betrieb: "Support",
          schule: "",
          status: "draft",
          trainee_id: 22
        };
      },
      async isTrainerAssignedToTrainee() {
        return true;
      }
    }
  });

  const result = await service.signReportEntryForActor({ id: 7, role: "trainer", name: "Trainer" }, "entry-2", "");
  assert.equal(result.error, "Nur eingereichte Eintraege koennen signiert werden.");
});

await test("rejectReportEntryForActor schreibt Rueckgabe fuer eingereichte Eintraege", async () => {
  const auditLogs = [];
  const service = createService({
    reportRepository: {
      async rejectSubmittedEntry() {
        return 1;
      }
    },
    sharedRepository: {
      async findEntryWithOwnerById() {
        return {
          id: "entry-3",
          weekLabel: "Bericht",
          dateFrom: "2026-04-03",
          dateTo: "2026-04-03",
          betrieb: "Support",
          schule: "",
          status: "submitted",
          trainee_id: 33
        };
      },
      async isTrainerAssignedToTrainee() {
        return true;
      }
    },
    async writeAuditLog(payload) {
      auditLogs.push(payload);
    }
  });

  const result = await service.rejectReportEntryForActor({ id: 5, role: "trainer", name: "Trainer" }, "entry-3", "Bitte ergänzen");
  assert.equal(result.ok, true);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].actionType, "REPORT_RETURNED");
});
