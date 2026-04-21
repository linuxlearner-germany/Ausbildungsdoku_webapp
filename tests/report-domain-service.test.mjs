import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createReportDomainService } = require("../services/report-domain-service");

function createDbStub({ entryByOwner = null, runResult = { changes: 1 } } = {}) {
  return {
    prepare(sql) {
      if (sql.includes("FROM entries") && sql.includes("WHERE id = ? AND trainee_id = ?")) {
        return {
          get() {
            return entryByOwner;
          }
        };
      }

      if (sql.includes("UPDATE entries")) {
        return {
          run() {
            return runResult;
          }
        };
      }

      throw new Error(`Nicht erwartetes SQL: ${sql}`);
    }
  };
}

function createService({ db, sharedRepository, writeAuditLog = () => {} }) {
  return createReportDomainService({
    db,
    reportRepository: {},
    sharedRepository,
    normalizeEntry: (value) => value,
    parseImportRows: () => ({ rows: [] }),
    detectImportColumns: () => ({}),
    parseImportedDate: () => "",
    writeAuditLog
  });
}

await test("submitReportEntryForTrainee lehnt signierte Eintraege ab", () => {
  const service = createService({
    db: createDbStub({
      entryByOwner: {
        id: "entry-1",
        weekLabel: "Bericht",
        dateFrom: "2026-04-01",
        dateTo: "2026-04-01",
        betrieb: "Werkstatt",
        schule: "",
        status: "signed"
      }
    }),
    sharedRepository: {}
  });

  const result = service.submitReportEntryForTrainee({ id: 11 }, "entry-1");
  assert.equal(result.error, "Signierte Einträge koennen nicht erneut eingereicht werden.");
});

await test("signReportEntryForActor erlaubt nur eingereichte Eintraege", () => {
  const service = createService({
    db: createDbStub(),
    sharedRepository: {
      findEntryWithOwnerById() {
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
      isTrainerAssignedToTrainee() {
        return true;
      }
    }
  });

  const result = service.signReportEntryForActor({ id: 7, role: "trainer", name: "Trainer" }, "entry-2", "");
  assert.equal(result.error, "Nur eingereichte Eintraege koennen signiert werden.");
});

await test("rejectReportEntryForActor schreibt Rueckgabe fuer eingereichte Eintraege", () => {
  const auditLogs = [];
  const service = createService({
    db: createDbStub(),
    sharedRepository: {
      findEntryWithOwnerById() {
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
      isTrainerAssignedToTrainee() {
        return true;
      }
    },
    writeAuditLog(payload) {
      auditLogs.push(payload);
    }
  });

  const result = service.rejectReportEntryForActor({ id: 5, role: "trainer", name: "Trainer" }, "entry-3", "Bitte ergänzen");
  assert.equal(result.ok, true);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].actionType, "REPORT_RETURNED");
});
