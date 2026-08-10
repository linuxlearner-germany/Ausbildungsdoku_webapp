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

await test("Freigabe schreibt kein Audit-Log, wenn der Bericht parallel verarbeitet wurde", async () => {
  const auditLogs = [];
  const service = createService({
    reportRepository: {
      async signEntry() {
        return 0;
      }
    },
    sharedRepository: {
      async findEntryWithOwnerById() {
        return {
          id: "entry-race", weekLabel: "Bericht", dateFrom: "2026-04-04", dateTo: "2026-04-04",
          betrieb: "Support", schule: "", status: "submitted", trainee_id: 33
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

  const result = await service.signReportEntryForActor({ id: 5, role: "trainer", name: "Trainer" }, "entry-race", "");
  assert.match(result.error, /inzwischen bereits verarbeitet/);
  assert.equal(auditLogs.length, 0);
});

await test("Freigabe und Rueckgabe veraendern den gespeicherten Ausbilderkommentar nicht", async () => {
  const repositoryCalls = [];
  const submittedEntry = {
    id: "entry-separated",
    weekLabel: "Bericht",
    dateFrom: "2026-04-05",
    dateTo: "2026-04-05",
    betrieb: "Support",
    schule: "",
    status: "submitted",
    trainee_id: 33,
    trainerComment: "Separat gespeicherter Kommentar"
  };
  const service = createService({
    reportRepository: {
      async signEntry(...args) {
        repositoryCalls.push(["sign", ...args]);
        return 1;
      },
      async rejectSubmittedEntry(...args) {
        repositoryCalls.push(["reject", ...args]);
        return 1;
      }
    },
    sharedRepository: {
      async findEntryWithOwnerById() {
        return submittedEntry;
      },
      async isTrainerAssignedToTrainee() {
        return true;
      }
    }
  });

  await service.signReportEntryForActor({ id: 5, role: "trainer", name: "Trainer" }, submittedEntry.id);
  await service.rejectReportEntryForActor({ id: 5, role: "trainer", name: "Trainer" }, submittedEntry.id, "Bitte ergänzen");

  assert.equal(repositoryCalls[0][0], "sign");
  assert.equal(repositoryCalls[0].length, 4);
  assert.deepEqual(repositoryCalls[1], ["reject", submittedEntry.id, "Bitte ergänzen"]);
});
