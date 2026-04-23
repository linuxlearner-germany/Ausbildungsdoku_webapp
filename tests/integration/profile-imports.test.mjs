import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import XLSX from "xlsx";
import { extractCookie, postJson, startServer } from "../helpers/test-server.mjs";

let nextPort = 3410;
let baseUrl = "";

async function withIsolatedServer(run) {
  const port = nextPort;
  nextPort += 1;
  baseUrl = `http://127.0.0.1:${port}`;
  const server = await startServer(port);

  try {
    await run();
  } finally {
    if (server.exitCode === null && !server.killed) {
      await new Promise((resolve) => {
        server.once("exit", resolve);
        server.kill("SIGTERM");
      });
    }
  }
}

await test("Trainee kann Profil nicht ueber Report-Speichern aendern", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const loginResponse = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });
  const cookie = extractCookie(loginResponse);

  const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: cookie }
  });
  const dashboard = await dashboardResponse.json();

  const response = await postJson(
    `${baseUrl}/api/report`,
    {
      trainee: {
        name: "Manipuliert",
        ausbildung: "Andere Ausbildung",
        betrieb: "Falscher Betrieb",
        berufsschule: "Andere Schule"
      },
      entries: dashboard.report.entries
    },
    cookie
  );

  const updated = await response.json();
  assert.equal(response.status, 200);
  assert.equal(updated.data.trainee.name, "Max Mustermann");
  assert.equal(updated.data.trainee.betrieb, "Muster GmbH");
  });
});

await test("Entwurf kann gespeichert werden, eingereichte und signierte Berichte bleiben gesperrt", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const loginResponse = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });
  const cookie = extractCookie(loginResponse);

  const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: cookie }
  });
  const dashboard = await dashboardResponse.json();

  const draftEntry = dashboard.report.entries.find((entry) => entry.status === "draft");
  const signedEntry = dashboard.report.entries.find((entry) => entry.status === "signed");

  const saveDraftResponse = await postJson(
    `${baseUrl}/api/report`,
    {
      entries: dashboard.report.entries.map((entry) =>
        entry.id === draftEntry.id
          ? { ...entry, betrieb: `${entry.betrieb} und Dokumentation` }
          : entry
      )
    },
    cookie
  );
  const savedDraft = await saveDraftResponse.json();
  assert.equal(saveDraftResponse.status, 200);
  assert.match(savedDraft.data.entries.find((entry) => entry.id === draftEntry.id).betrieb, /Dokumentation/);

  const submitDraftResponse = await postJson(
    `${baseUrl}/api/report/submit`,
    { entryId: draftEntry.id },
    cookie
  );
  assert.equal(submitDraftResponse.status, 200);

  const lockedDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: cookie }
  });
  const lockedDashboard = await lockedDashboardResponse.json();
  const submittedEntry = lockedDashboard.report.entries.find((entry) => entry.id === draftEntry.id);

  const saveSubmittedResponse = await postJson(
    `${baseUrl}/api/report`,
    {
      entries: lockedDashboard.report.entries.map((entry) =>
        entry.id === submittedEntry.id
          ? { ...entry, betrieb: `${entry.betrieb} nachtraeglich geaendert` }
          : entry
      )
    },
    cookie
  );
  const submittedError = await saveSubmittedResponse.json();
  assert.equal(saveSubmittedResponse.status, 400);
  assert.match(submittedError.error.message, /schreibgeschuetzt/i);

  const saveSignedResponse = await postJson(
    `${baseUrl}/api/report`,
    {
      entries: lockedDashboard.report.entries.map((entry) =>
        entry.id === signedEntry.id
          ? { ...entry, betrieb: `${entry.betrieb} unzulaessig` }
          : entry
      )
    },
    cookie
  );
  const signedError = await saveSignedResponse.json();
  assert.equal(saveSignedResponse.status, 400);
  assert.match(signedError.error.message, /Signierte Eintraege/);
  });
});

await test("Neuer Entwurf bleibt nach signiertem Bericht getrennt und wird als neuer Bericht erstellt", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const loginResponse = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });
  const cookie = extractCookie(loginResponse);

  const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: cookie }
  });
  const dashboard = await dashboardResponse.json();
  const signedEntry = dashboard.report.entries.find((entry) => entry.status === "signed");
  assert.ok(signedEntry);
  const signedSnapshot = { ...signedEntry };

  const createDate = "2026-05-01";
  const createDraftResponse = await postJson(
    `${baseUrl}/api/report/draft`,
    { dateFrom: createDate, dateTo: createDate, weekLabel: "Neuer Tagesbericht" },
    cookie
  );
  const createdDraft = await createDraftResponse.json();
  assert.equal(createDraftResponse.status, 200);
  assert.ok(createdDraft.entry?.id);
  assert.notEqual(createdDraft.entry.id, signedEntry.id);
  assert.equal(createdDraft.entry.status, "draft");
  assert.equal(createdDraft.entry.dateFrom, createDate);

  const updateDraftResponse = await postJson(
    `${baseUrl}/api/report/entry/${createdDraft.entry.id}`,
    {
      weekLabel: "Neuer sauberer Entwurf",
      dateFrom: createDate,
      dateTo: createDate,
      betrieb: "Neuer Inhalt",
      schule: ""
    },
    cookie
  );
  const updatedDraft = await updateDraftResponse.json();
  assert.equal(updateDraftResponse.status, 200);
  assert.equal(updatedDraft.entry.id, createdDraft.entry.id);
  assert.equal(updatedDraft.entry.status, "draft");
  assert.equal(updatedDraft.entry.betrieb, "Neuer Inhalt");

  const submitDraftResponse = await postJson(
    `${baseUrl}/api/report/submit`,
    { entryId: createdDraft.entry.id },
    cookie
  );
  assert.equal(submitDraftResponse.status, 200);

  const refreshedResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: cookie }
  });
  const refreshedDashboard = await refreshedResponse.json();
  const refreshedSignedEntry = refreshedDashboard.report.entries.find((entry) => entry.id === signedEntry.id);
  const refreshedCreatedEntry = refreshedDashboard.report.entries.find((entry) => entry.id === createdDraft.entry.id);

  assert.equal(refreshedSignedEntry.status, "signed");
  assert.equal(refreshedSignedEntry.betrieb, signedSnapshot.betrieb);
  assert.equal(refreshedSignedEntry.schule, signedSnapshot.schule);
  assert.equal(refreshedCreatedEntry.status, "submitted");
  assert.equal(refreshedCreatedEntry.dateFrom, createDate);
  });
});

await test("Trainer darf zugeordnetes Azubi-Profil aendern", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const trainerLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "trainer",
    password: "trainer123"
  });
  const trainerCookie = extractCookie(trainerLogin);

  const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: trainerCookie }
  });
  const dashboard = await dashboardResponse.json();
  const trainee = dashboard.trainees[0];

  const updateResponse = await postJson(
    `${baseUrl}/api/profile/${trainee.id}`,
    {
      name: "Max Mustermann Neu",
      ausbildung: "Fachinformatiker Systemintegration",
      betrieb: "WIWEB Testbetrieb",
      berufsschule: "BBS Test"
    },
    trainerCookie
  );
  assert.equal(updateResponse.status, 200);

  const refreshedResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: trainerCookie }
  });
  const refreshed = await refreshedResponse.json();
  assert.equal(refreshed.trainees[0].name, "Max Mustermann Neu");
  assert.equal(refreshed.trainees[0].betrieb, "WIWEB Testbetrieb");
  });
});

await test("Trainee darf Profil-API nicht nutzen", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const traineeLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });
  const traineeCookie = extractCookie(traineeLogin);

  const deniedResponse = await postJson(
    `${baseUrl}/api/profile/2`,
    {
      name: "Unberechtigt",
      ausbildung: "Nein",
      betrieb: "Nein",
      berufsschule: "Nein"
    },
    traineeCookie
  );

  assert.equal(deniedResponse.status, 403);
  });
});

await test("Theme-Praeferenz wird pro Benutzer gespeichert", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const loginResponse = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });
  const cookie = extractCookie(loginResponse);

  const saveResponse = await postJson(
    `${baseUrl}/api/preferences/theme`,
    { themePreference: "dark" },
    cookie
  );
  assert.equal(saveResponse.status, 200);

  const sessionResponse = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: cookie }
  });
  const sessionData = await sessionResponse.json();
  assert.equal(sessionData.user.themePreference, "dark");
  });
});

await test("Import-Vorschau erkennt gueltige und doppelte Berichtstage", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const loginResponse = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });
  const cookie = extractCookie(loginResponse);

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Datum", "Titel", "Betrieb", "Berufsschule"],
    ["2026-03-10", "Importierter Bericht", "Support", ""],
    ["2026-03-10", "Duplikat", "Support", ""],
    ["", "Ohne Datum", "", ""]
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Import");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  const previewResponse = await postJson(
    `${baseUrl}/api/report/import-preview`,
    {
      filename: "berichte.xlsx",
      contentBase64: buffer.toString("base64")
    },
    cookie
  );
  const previewData = await previewResponse.json();

  assert.equal(previewResponse.status, 200);
  assert.equal(previewData.summary.totalRows, 3);
  assert.equal(previewData.summary.validRows, 1);
  assert.equal(previewData.summary.invalidRows, 2);
  });
});

await test("Import legt Berichte als submitted an", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const loginResponse = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });
  const cookie = extractCookie(loginResponse);

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Datum", "Titel", "Betrieb", "Berufsschule"],
    ["2026-04-01", "Import April 1", "Deployment", ""],
    ["2026-04-02", "Import April 2", "", "Berufsschule"]
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Import");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  const importResponse = await postJson(
    `${baseUrl}/api/report/import`,
    {
      filename: "berichte.xlsx",
      contentBase64: buffer.toString("base64")
    },
    cookie
  );
  const importData = await importResponse.json();

  assert.equal(importResponse.status, 200);
  assert.equal(importData.importedCount, 2);
  assert.ok(importData.entries.some((entry) => entry.dateFrom === "2026-04-01" && entry.status === "submitted"));
  assert.ok(importData.entries.some((entry) => entry.dateFrom === "2026-04-02" && entry.status === "submitted"));
  });
});
