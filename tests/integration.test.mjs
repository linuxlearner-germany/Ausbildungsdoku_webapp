import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import XLSX from "xlsx";

let nextPort = 3210;
let baseUrl = "";

function startServer(tmpDir, port) {
  const child = spawn("node", ["index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "development",
      SESSION_SECRET: "test-secret",
      ENABLE_DEMO_DATA: "true",
      DATA_DIR: tmpDir,
      DB_FILE: path.join(tmpDir, "berichtsheft.db"),
      LEGACY_FILE: path.join(tmpDir, "berichtsheft.json")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Serverstart Timeout"));
    }, 10000);

    child.stdout.on("data", (data) => {
      if (String(data).includes(`http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve(child);
      }
    });

    child.stderr.on("data", (data) => {
      const message = String(data);
      if (message.trim()) {
        clearTimeout(timeout);
        reject(new Error(message));
      }
    });
  });
}

function extractCookie(response) {
  return response.headers.get("set-cookie")?.split(";")[0] || "";
}

async function postJson(url, body, cookie = "") {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

async function withIsolatedServer(run) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "berichtsheft-test-"));
  const port = nextPort;
  nextPort += 1;
  baseUrl = `http://127.0.0.1:${port}`;
  const server = await startServer(tmpDir, port);

  try {
    await run();
  } finally {
    if (server.exitCode === null && !server.killed) {
      await new Promise((resolve) => {
        server.once("exit", resolve);
        server.kill("SIGTERM");
      });
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

await test("Login funktioniert mit Demo-User", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const response = await postJson(`${baseUrl}/api/login`, {
      identifier: "azubi",
      password: "azubi123"
    });

    assert.equal(response.status, 200);
    assert.ok(extractCookie(response));
  });
});

await test("Login-Rate-Limit greift", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    for (let index = 0; index < 8; index += 1) {
      const response = await postJson(`${baseUrl}/api/login`, {
        identifier: "limit@example.com",
        password: "falsch"
      });
      assert.equal(response.status, 401);
    }

    const blocked = await postJson(`${baseUrl}/api/login`, {
      identifier: "limit@example.com",
      password: "falsch"
    });
    assert.equal(blocked.status, 429);
  });
});

await test("Nur Entwuerfe koennen geloescht werden", { concurrency: false }, async () => {
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
    const submittedEntry = dashboard.report.entries.find((entry) => entry.status === "submitted");

    const deleteResponse = await fetch(`${baseUrl}/api/report/${submittedEntry.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie }
    });

    assert.equal(deleteResponse.status, 400);
  });
});

await test("Signieren nur fuer eingereichte Eintraege", { concurrency: false }, async () => {
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
    const draftEntry = dashboard.trainees.flatMap((trainee) => trainee.entries).find((entry) => entry.status === "draft");
    const submittedEntry = dashboard.trainees.flatMap((trainee) => trainee.entries).find((entry) => entry.status === "submitted");

    const invalidSign = await postJson(
      `${baseUrl}/api/trainer/sign`,
      { entryId: draftEntry.id, trainerComment: "" },
      trainerCookie
    );
    assert.equal(invalidSign.status, 400);

    const validSign = await postJson(
      `${baseUrl}/api/trainer/sign`,
      { entryId: submittedEntry.id, trainerComment: "" },
      trainerCookie
    );
    assert.equal(validSign.status, 200);
  });
});

await test("Azubi kann mehrere eigene Berichte gesammelt einreichen", { concurrency: false }, async () => {
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
    const rejectedEntry = dashboard.report.entries.find((entry) => entry.status === "rejected");

    const batchResponse = await postJson(
      `${baseUrl}/api/report/submit-batch`,
      { entryIds: [draftEntry.id, rejectedEntry.id] },
      cookie
    );
    const batchData = await batchResponse.json();

    assert.equal(batchResponse.status, 200);
    assert.equal(batchData.processedCount, 2);
    assert.equal(batchData.failed.length, 0);
    assert.ok(batchData.entries.some((entry) => entry.id === draftEntry.id && entry.status === "submitted"));
    assert.ok(batchData.entries.some((entry) => entry.id === rejectedEntry.id && entry.status === "submitted"));
  });
});

await test("Sammel-Einreichung meldet Teilfehler fuer unzulaessige Berichte", { concurrency: false }, async () => {
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

    const batchResponse = await postJson(
      `${baseUrl}/api/report/submit-batch`,
      { entryIds: [draftEntry.id, signedEntry.id] },
      cookie
    );
    const batchData = await batchResponse.json();

    assert.equal(batchResponse.status, 200);
    assert.equal(batchData.processedCount, 1);
    assert.equal(batchData.failed.length, 1);
    assert.match(batchData.failed[0].error, /Signierte Einträge/i);
    assert.ok(batchData.entries.some((entry) => entry.id === draftEntry.id && entry.status === "submitted"));
    assert.ok(batchData.entries.some((entry) => entry.id === signedEntry.id && entry.status === "signed"));
  });
});

await test("Ausbilder kann mehrere eingereichte Berichte gesammelt freigeben", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const traineeLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "azubi",
      password: "azubi123"
    });
    const traineeCookie = extractCookie(traineeLogin);

    const createDraft = await postJson(
      `${baseUrl}/api/report/draft`,
      { dateFrom: "2026-04-03", weekLabel: "Batch Freigabe", betrieb: "Support", schule: "" },
      traineeCookie
    );
    const createdDraft = await createDraft.json();
    await postJson(
      `${baseUrl}/api/report/entry/${createdDraft.entry.id}`,
      { ...createdDraft.entry, betrieb: "Support", schule: "" },
      traineeCookie
    );
    await postJson(`${baseUrl}/api/report/submit`, { entryId: createdDraft.entry.id }, traineeCookie);

    const trainerLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "trainer",
      password: "trainer123"
    });
    const trainerCookie = extractCookie(trainerLogin);

    const trainerDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: trainerCookie }
    });
    const trainerDashboard = await trainerDashboardResponse.json();
    const submittedEntries = trainerDashboard.trainees.flatMap((trainee) => trainee.entries).filter((entry) => entry.status === "submitted");

    const batchResponse = await postJson(
      `${baseUrl}/api/trainer/batch`,
      { action: "sign", entryIds: submittedEntries.slice(0, 2).map((entry) => entry.id), trainerComment: "Batch-Freigabe" },
      trainerCookie
    );
    const batchData = await batchResponse.json();

    assert.equal(batchResponse.status, 200);
    assert.equal(batchData.processedCount, 2);
    assert.equal(batchData.failed.length, 0);

    const refreshedResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: trainerCookie }
    });
    const refreshedDashboard = await refreshedResponse.json();
    const refreshedEntries = refreshedDashboard.trainees.flatMap((trainee) => trainee.entries);
    for (const entryId of submittedEntries.slice(0, 2).map((entry) => entry.id)) {
      assert.ok(refreshedEntries.some((entry) => entry.id === entryId && entry.status === "signed" && entry.trainerComment === "Batch-Freigabe"));
    }
  });
});

await test("Ausbilder kann mehrere eingereichte Berichte gesammelt zurueckgeben", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const traineeLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "azubi",
      password: "azubi123"
    });
    const traineeCookie = extractCookie(traineeLogin);

    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: traineeCookie }
    });
    const dashboard = await dashboardResponse.json();

    const draftResponse = await postJson(
      `${baseUrl}/api/report/draft`,
      { dateFrom: "2026-04-03", weekLabel: "Batch Rueckgabe Neu", betrieb: "Support", schule: "" },
      traineeCookie
    );
    const draft = await draftResponse.json();
    await postJson(
      `${baseUrl}/api/report/entry/${draft.entry.id}`,
      { ...draft.entry, weekLabel: "Batch Rueckgabe Neu", betrieb: "Support", schule: "" },
      traineeCookie
    );
    await postJson(`${baseUrl}/api/report/submit`, { entryId: draft.entry.id }, traineeCookie);

    const trainerLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "trainer",
      password: "trainer123"
    });
    const trainerCookie = extractCookie(trainerLogin);

    const trainerDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: trainerCookie }
    });
    const trainerDashboard = await trainerDashboardResponse.json();
    const submittedEntries = trainerDashboard.trainees.flatMap((trainee) => trainee.entries).filter((entry) => entry.status === "submitted");

    const batchResponse = await postJson(
      `${baseUrl}/api/trainer/batch`,
      { action: "reject", entryIds: submittedEntries.slice(0, 2).map((entry) => entry.id), reason: "Bitte nacharbeiten" },
      trainerCookie
    );
    const batchData = await batchResponse.json();

    assert.equal(batchResponse.status, 200);
    assert.equal(batchData.processedCount, 2);
    assert.equal(batchData.failed.length, 0);

    const refreshedResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: traineeCookie }
    });
    const refreshedDashboard = await refreshedResponse.json();
    for (const entryId of submittedEntries.slice(0, 2).map((entry) => entry.id)) {
      assert.ok(refreshedDashboard.report.entries.some((entry) => entry.id === entryId && entry.status === "rejected" && entry.rejectionReason === "Bitte nacharbeiten"));
    }
  });
});

await test("Sammelfreigabe blockiert fremde Berichte mit Teilfehler", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const adminLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "admin123"
    });
    const adminCookie = extractCookie(adminLogin);

    await postJson(
      `${baseUrl}/api/admin/users`,
      { name: "Trainer Zwei", username: "trainer-zwei", email: "trainer-zwei@example.com", password: "Trainerkonto123", role: "trainer" },
      adminCookie
    );

    const adminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: adminCookie }
    });
    const adminDashboard = await adminDashboardResponse.json();
    const secondTrainer = adminDashboard.users.find((user) => user.username === "trainer-zwei");

    const createTraineeResponse = await postJson(
      `${baseUrl}/api/admin/users`,
      {
        name: "Fremder Azubi",
        username: "fremder-azubi",
        email: "fremder-azubi@example.com",
        password: "Azubikonto123",
        role: "trainee",
        ausbildung: "Fremd",
        trainerIds: [secondTrainer.id]
      },
      adminCookie
    );
    assert.equal(createTraineeResponse.status, 200);

    const foreignTraineeLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "fremder-azubi",
      password: "Azubikonto123"
    });
    const foreignTraineeCookie = extractCookie(foreignTraineeLogin);

    const foreignDraftResponse = await postJson(
      `${baseUrl}/api/report/draft`,
      { dateFrom: "2026-04-03", weekLabel: "Fremdbericht", betrieb: "Support", schule: "" },
      foreignTraineeCookie
    );
    const foreignDraft = await foreignDraftResponse.json();
    await postJson(`${baseUrl}/api/report/submit`, { entryId: foreignDraft.entry.id }, foreignTraineeCookie);
    const foreignBeforeResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: foreignTraineeCookie }
    });
    const foreignBefore = await foreignBeforeResponse.json();
    const foreignBeforeEntry = foreignBefore.report.entries.find((entry) => entry.id === foreignDraft.entry.id);

    const trainerLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "trainer",
      password: "trainer123"
    });
    const trainerCookie = extractCookie(trainerLogin);

    const trainerDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: trainerCookie }
    });
    const trainerDashboard = await trainerDashboardResponse.json();
    const ownSubmitted = trainerDashboard.trainees.flatMap((trainee) => trainee.entries).find((entry) => entry.status === "submitted");

    const batchResponse = await postJson(
      `${baseUrl}/api/trainer/batch`,
      { action: "sign", entryIds: [ownSubmitted.id, foreignDraft.entry.id], trainerComment: "Gemischt" },
      trainerCookie
    );
    const batchData = await batchResponse.json();

    assert.equal(batchResponse.status, 200);
    assert.equal(batchData.processedCount, 1);
    assert.equal(batchData.failed.length, 1);
    assert.match(batchData.failed[0].error, /gehört nicht zu dir/i);

    const foreignDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: foreignTraineeCookie }
    });
    const foreignDashboard = await foreignDashboardResponse.json();
    assert.ok(
      foreignDashboard.report.entries.some(
        (entry) => entry.id === foreignDraft.entry.id && entry.status === foreignBeforeEntry.status
      )
    );
  });
});

await test("Health-Endpoint ist erreichbar", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.status, "healthy");
  });
});

await test("Admin-User-Anlage verlangt gueltige E-Mail und starkes Passwort", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const adminLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "admin123"
    });
    const adminCookie = extractCookie(adminLogin);

    const invalidEmail = await postJson(
      `${baseUrl}/api/admin/users`,
      { name: "Test User", username: "test-user", email: "ungueltig", password: "sehrlangespasswort", role: "trainer" },
      adminCookie
    );
    assert.equal(invalidEmail.status, 400);

    const weakPassword = await postJson(
      `${baseUrl}/api/admin/users`,
      { name: "Test User", username: "test-user", email: "test@example.com", password: "kurz", role: "trainer" },
      adminCookie
    );
    assert.equal(weakPassword.status, 400);
  });
});

await test("Admin kann Benutzer mit Benutzername anlegen", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const adminLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "admin123"
    });
    const adminCookie = extractCookie(adminLogin);

    const response = await postJson(
      `${baseUrl}/api/admin/users`,
      { name: "Neue Person", username: "neue-person", email: "neu@example.com", password: "Testkonto123", role: "trainer" },
      adminCookie
    );

    assert.equal(response.status, 200);
  });
});

await test("Admin kann Benutzer bearbeiten und Bearbeitungsdaten speichern", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const adminLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "admin",
    password: "admin123"
  });
  const adminCookie = extractCookie(adminLogin);

  const createTraineeResponse = await postJson(
    `${baseUrl}/api/admin/users`,
    {
      name: "Bearbeitungs Azubi",
      username: "bearbeitungs-azubi",
      email: "bearbeitungs-azubi@example.com",
      password: "Azubikonto123",
      role: "trainee",
      ausbildung: "Fachinformatiker Systemintegration",
      betrieb: "Muster GmbH",
      berufsschule: "BBS",
      trainerIds: []
    },
    adminCookie
  );
  assert.equal(createTraineeResponse.status, 200);

  const secondTrainerResponse = await postJson(
    `${baseUrl}/api/admin/users`,
    {
      name: "Bearbeitungs Ausbilder",
      username: "bearbeitungs-ausbilder",
      email: "bearbeitungs-ausbilder@example.com",
      password: "Trainerkonto123",
      role: "trainer",
      betrieb: "WIWEB"
    },
    adminCookie
  );
  assert.equal(secondTrainerResponse.status, 200);

  const adminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: adminCookie }
  });
  const adminDashboard = await adminDashboardResponse.json();
  const trainee = adminDashboard.users.find((user) => user.username === "bearbeitungs-azubi");
  const trainerIds = adminDashboard.users
    .filter((user) => ["trainer", "bearbeitungs-ausbilder"].includes(user.username))
    .map((user) => user.id);

  const updateResponse = await postJson(
    `${baseUrl}/api/admin/users/${trainee.id}`,
    {
      name: "Bearbeitungs Azubi Aktualisiert",
      username: "bearbeitungs-azubi",
      email: "bearbeitungs-azubi@example.com",
      role: "trainee",
      password: "",
      ausbildung: "Fachinformatiker Daten und Prozessanalyse",
      betrieb: "Neue Muster GmbH",
      berufsschule: "Neue BBS",
      trainerIds
    },
    adminCookie
  );
  assert.equal(updateResponse.status, 200);

  const refreshedAdminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: adminCookie }
  });
  const refreshedAdminDashboard = await refreshedAdminDashboardResponse.json();
  const updatedTrainee = refreshedAdminDashboard.users.find((user) => user.id === trainee.id);

  assert.equal(updatedTrainee.name, "Bearbeitungs Azubi Aktualisiert");
  assert.equal(updatedTrainee.ausbildung, "Fachinformatiker Daten und Prozessanalyse");
  assert.equal(updatedTrainee.betrieb, "Neue Muster GmbH");
  assert.deepEqual(updatedTrainee.trainerIds.slice().sort((a, b) => a - b), trainerIds.slice().sort((a, b) => a - b));
  });
});

await test("Admin kann Azubi mit Ausbildung und mehreren Ausbildern verwalten", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const adminLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "admin",
    password: "admin123"
  });
  const adminCookie = extractCookie(adminLogin);

  const secondTrainerResponse = await postJson(
    `${baseUrl}/api/admin/users`,
    {
      name: "Zweiter Ausbilder",
      username: "zweiter-ausbilder",
      email: "zweiter-ausbilder@example.com",
      password: "Trainerkonto123",
      role: "trainer",
      betrieb: "WIWEB"
    },
    adminCookie
  );
  assert.equal(secondTrainerResponse.status, 200);

  const adminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: adminCookie }
  });
  const adminDashboard = await adminDashboardResponse.json();
  const trainerIds = adminDashboard.users.filter((user) => user.role === "trainer").map((user) => user.id);
  assert.ok(trainerIds.length >= 2);

  const createTraineeResponse = await postJson(
    `${baseUrl}/api/admin/users`,
    {
      name: "Mehrfach Azubi",
      username: "mehrfach-azubi",
      email: "mehrfach-azubi@example.com",
      password: "Azubikonto123",
      role: "trainee",
      ausbildung: "Fachinformatiker Anwendungsentwicklung",
      betrieb: "WIWEB",
      trainerIds
    },
    adminCookie
  );
  assert.equal(createTraineeResponse.status, 200);

  const refreshedAdminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: adminCookie }
  });
  const refreshedAdminDashboard = await refreshedAdminDashboardResponse.json();
  const createdTrainee = refreshedAdminDashboard.users.find((user) => user.username === "mehrfach-azubi");

  assert.equal(createdTrainee.ausbildung, "Fachinformatiker Anwendungsentwicklung");
  assert.deepEqual(createdTrainee.trainerIds.slice().sort((a, b) => a - b), trainerIds.slice().sort((a, b) => a - b));
  assert.equal(refreshedAdminDashboard.educations.some((education) => education.name === "Fachinformatiker Anwendungsentwicklung"), true);

  const trainerLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "trainer",
    password: "trainer123"
  });
  const trainerCookie = extractCookie(trainerLogin);
  const trainerDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: trainerCookie }
  });
  const trainerDashboard = await trainerDashboardResponse.json();
  assert.equal(trainerDashboard.trainees.some((trainee) => trainee.username === "mehrfach-azubi"), true);
  });
});

await test("Admin kann Nutzer per CSV validieren und importieren", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const adminLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "admin",
    password: "admin123"
  });
  const adminCookie = extractCookie(adminLogin);

  const previewCsv = [
    "name,username,email,role,password,ausbildung,betrieb,berufsschule,trainer_usernames",
    "CSV Ausbilder,csv-trainer,csv-trainer@example.com,trainer,Passwort123!,,,,",
    "CSV Azubi,csv-azubi,csv-azubi@example.com,trainee,Passwort123!,Fachinformatiker Systemintegration,Muster GmbH,BBS,csv-trainer",
    "Fehler Doppelung,azubi,azubi@example.com,trainee,Passwort123!,Fachinformatiker Systemintegration,Muster GmbH,BBS,trainer"
  ].join("\n");

  const previewResponse = await postJson(
    `${baseUrl}/api/admin/users/import-preview`,
    {
      filename: "benutzer.csv",
      contentBase64: Buffer.from(previewCsv, "utf8").toString("base64")
    },
    adminCookie
  );
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(preview.summary.totalRows, 3);
  assert.equal(preview.summary.validRows, 2);
  assert.equal(preview.summary.invalidRows, 1);
  assert.equal(preview.rows.find((row) => row.username === "csv-azubi").trainerUsernames.includes("csv-trainer"), true);
  assert.equal(preview.rows.find((row) => row.username === "azubi").errors.some((error) => error.includes("existiert bereits")), true);

  const importCsv = [
    "name,username,email,role,password,ausbildung,betrieb,berufsschule,trainer_usernames",
    "CSV Import Ausbilder,csv-import-trainer,csv-import-trainer@example.com,trainer,Passwort123!,,,,",
    "CSV Import Azubi,csv-import-azubi,csv-import-azubi@example.com,trainee,Passwort123!,Fachinformatiker Systemintegration,Muster GmbH,BBS,csv-import-trainer"
  ].join("\n");

  const importResponse = await postJson(
    `${baseUrl}/api/admin/users/import`,
    {
      filename: "benutzer-import.csv",
      contentBase64: Buffer.from(importCsv, "utf8").toString("base64")
    },
    adminCookie
  );
  assert.equal(importResponse.status, 200);
  const importResult = await importResponse.json();
  assert.equal(importResult.importedCount, 2);

  const refreshedAdminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: adminCookie }
  });
  const refreshedAdminDashboard = await refreshedAdminDashboardResponse.json();
  const importedTrainer = refreshedAdminDashboard.users.find((user) => user.username === "csv-import-trainer");
  const importedTrainee = refreshedAdminDashboard.users.find((user) => user.username === "csv-import-azubi");

  assert.ok(importedTrainer);
  assert.ok(importedTrainee);
  assert.equal(importedTrainee.trainerIds.includes(importedTrainer.id), true);
  });
});

await test("Admin kann Azubi mit Berichten, Noten und Zuordnungen loeschen", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const adminLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "admin123"
    });
    const adminCookie = extractCookie(adminLogin);

    const trainerCreateResponse = await postJson(
      `${baseUrl}/api/admin/users`,
      {
        name: "Delete Trainer",
        username: "delete-trainer",
        email: "delete-trainer@example.com",
        password: "Trainerkonto123",
        role: "trainer"
      },
      adminCookie
    );
    assert.equal(trainerCreateResponse.status, 200);

    const traineeCreateResponse = await postJson(
      `${baseUrl}/api/admin/users`,
      {
        name: "Delete Azubi",
        username: "delete-azubi",
        email: "delete-azubi@example.com",
        password: "Azubikonto123",
        role: "trainee",
        ausbildung: "Fachinformatiker Systemintegration",
        betrieb: "LoeSch GmbH",
        berufsschule: "BBS Loesch",
        trainerIds: []
      },
      adminCookie
    );
    assert.equal(traineeCreateResponse.status, 200);

    const adminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: adminCookie }
    });
    const adminDashboard = await adminDashboardResponse.json();
    const createdTrainer = adminDashboard.users.find((user) => user.username === "delete-trainer");
    const createdTrainee = adminDashboard.users.find((user) => user.username === "delete-azubi");
    assert.ok(createdTrainer);
    assert.ok(createdTrainee);

    const assignResponse = await postJson(
      `${baseUrl}/api/admin/assign-trainer`,
      {
        traineeId: createdTrainee.id,
        trainerIds: [createdTrainer.id]
      },
      adminCookie
    );
    assert.equal(assignResponse.status, 200);

    const traineeLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "delete-azubi",
      password: "Azubikonto123"
    });
    const traineeCookie = extractCookie(traineeLogin);

    const draftResponse = await postJson(
      `${baseUrl}/api/report/draft`,
      {
        dateFrom: "2026-04-11",
        dateTo: "2026-04-11",
        weekLabel: "Delete Bericht"
      },
      traineeCookie
    );
    const draftData = await draftResponse.json();
    assert.equal(draftResponse.status, 200);

    const updateDraftResponse = await postJson(
      `${baseUrl}/api/report/entry/${draftData.entry.id}`,
      {
        weekLabel: "Delete Bericht",
        dateFrom: "2026-04-11",
        dateTo: "2026-04-11",
        betrieb: "Soll verschwinden",
        schule: ""
      },
      traineeCookie
    );
    assert.equal(updateDraftResponse.status, 200);

    const gradeResponse = await postJson(
      `${baseUrl}/api/grades`,
      {
        traineeId: createdTrainee.id,
        fach: "Delete Fach",
        typ: "Schulaufgabe",
        bezeichnung: "Delete Note",
        datum: "2026-04-11",
        note: 2
      },
      adminCookie
    );
    assert.equal(gradeResponse.status, 200);

    const deleteResponse = await fetch(`${baseUrl}/api/admin/users/${createdTrainee.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie }
    });
    const deleteData = await deleteResponse.json();
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteData.deletedUser.username, "delete-azubi");
    assert.equal(deleteData.cleanup.removedReports >= 1, true);
    assert.equal(deleteData.cleanup.removedGrades >= 1, true);
    assert.equal(deleteData.cleanup.removedAssignments >= 1, true);

    const refreshedAdminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: adminCookie }
    });
    const refreshedAdminDashboard = await refreshedAdminDashboardResponse.json();
    assert.equal(refreshedAdminDashboard.users.some((user) => user.username === "delete-azubi"), false);

    const trainerLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "delete-trainer",
      password: "Trainerkonto123"
    });
    const trainerCookie = extractCookie(trainerLogin);
    const trainerDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: trainerCookie }
    });
    const trainerDashboard = await trainerDashboardResponse.json();
    assert.equal(trainerDashboard.trainees.some((trainee) => trainee.username === "delete-azubi"), false);

    const gradesAfterDeleteResponse = await fetch(`${baseUrl}/api/grades?traineeId=${createdTrainee.id}`, {
      headers: { Cookie: adminCookie }
    });
    assert.equal(gradesAfterDeleteResponse.status, 404);
  });
});

await test("Admin kann Ausbilder loeschen und Zuordnungen werden bereinigt", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const adminLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "admin123"
    });
    const adminCookie = extractCookie(adminLogin);

    const trainerCreateResponse = await postJson(
      `${baseUrl}/api/admin/users`,
      {
        name: "Delete Ausbilder",
        username: "delete-ausbilder",
        email: "delete-ausbilder@example.com",
        password: "Trainerkonto123",
        role: "trainer"
      },
      adminCookie
    );
    assert.equal(trainerCreateResponse.status, 200);

    const adminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: adminCookie }
    });
    const adminDashboard = await adminDashboardResponse.json();
    const deleteTrainer = adminDashboard.users.find((user) => user.username === "delete-ausbilder");
    const trainee = adminDashboard.users.find((user) => user.username === "azubi");
    assert.ok(deleteTrainer);
    assert.ok(trainee);

    const assignResponse = await postJson(
      `${baseUrl}/api/admin/assign-trainer`,
      {
        traineeId: trainee.id,
        trainerIds: [...new Set([...(trainee.trainerIds || []), deleteTrainer.id])]
      },
      adminCookie
    );
    assert.equal(assignResponse.status, 200);

    const deleteResponse = await fetch(`${baseUrl}/api/admin/users/${deleteTrainer.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie }
    });
    assert.equal(deleteResponse.status, 200);

    const refreshedDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: adminCookie }
    });
    const refreshedDashboard = await refreshedDashboardResponse.json();
    const refreshedTrainee = refreshedDashboard.users.find((user) => user.username === "azubi");
    assert.equal(refreshedDashboard.users.some((user) => user.username === "delete-ausbilder"), false);
    assert.equal(refreshedTrainee.trainerIds.includes(deleteTrainer.id), false);
    assert.equal(refreshedTrainee.assignedTrainers.some((trainer) => trainer.id === deleteTrainer.id), false);
  });
});

await test("Benutzer-Loeschen ist nur fuer Admins erlaubt", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const traineeLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "azubi",
      password: "azubi123"
    });
    const traineeCookie = extractCookie(traineeLogin);

    const response = await fetch(`${baseUrl}/api/admin/users/1`, {
      method: "DELETE",
      headers: { Cookie: traineeCookie }
    });

    assert.equal(response.status, 403);
  });
});

await test("Admin-CSV-Export enthaelt Verwaltungsdaten ohne sensible Felder", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const adminLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "admin123"
    });
    const adminCookie = extractCookie(adminLogin);

    const createTrainerResponse = await postJson(
      `${baseUrl}/api/admin/users`,
      {
        name: "CSV Trainer Extra",
        username: "csv-trainer-extra",
        email: "csv-trainer-extra@example.com",
        password: "Trainerkonto123",
        role: "trainer"
      },
      adminCookie
    );
    assert.equal(createTrainerResponse.status, 200);

    const adminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: adminCookie }
    });
    const adminDashboard = await adminDashboardResponse.json();
    const trainerIds = adminDashboard.users
      .filter((user) => ["trainer", "csv-trainer-extra"].includes(user.username))
      .map((user) => user.id);

    const createTraineeResponse = await postJson(
      `${baseUrl}/api/admin/users`,
      {
        name: "CSV Äzubi Export",
        username: "csv-azubi-export",
        email: "csv-azubi-export@example.com",
        password: "Azubikonto123",
        role: "trainee",
        ausbildung: "Fachinformatiker Systemintegration",
        betrieb: "Büro Export",
        berufsschule: "BBS Köln",
        trainerIds
      },
      adminCookie
    );
    assert.equal(createTraineeResponse.status, 200);

    const exportResponse = await fetch(`${baseUrl}/api/admin/users/export.csv`, {
      headers: { Cookie: adminCookie }
    });
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type") || "", /text\/csv;\s*charset=utf-8/i);
    assert.match(exportResponse.headers.get("content-disposition") || "", /verwaltung-benutzer\.csv/i);

    const csvBuffer = Buffer.from(await exportResponse.arrayBuffer());
    assert.equal(csvBuffer[0], 0xEF);
    assert.equal(csvBuffer[1], 0xBB);
    assert.equal(csvBuffer[2], 0xBF);
    const csvText = csvBuffer.toString("utf8");

    assert.match(csvText, /"User-ID";"Name";"Benutzername";"E-Mail";"Rolle";"Ausbildung";"Betrieb";"Berufsschule";"Zugeordnete Ausbilder"/);
    assert.match(csvText, /CSV Äzubi Export/);
    assert.match(csvText, /Büro Export/);
    assert.match(csvText, /BBS Köln/);
    assert.match(csvText, /Herr Ausbilder \| CSV Trainer Extra/);
    assert.doesNotMatch(csvText, /password_hash/i);
    assert.doesNotMatch(csvText, /Passwort123/i);
    assert.doesNotMatch(csvText, /berichtsheft\.sid/i);
  });
});

await test("Admin-CSV-Export ist fuer Nicht-Admins gesperrt", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const trainerLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "trainer",
      password: "trainer123"
    });
    const trainerCookie = extractCookie(trainerLogin);

    const response = await fetch(`${baseUrl}/api/admin/users/export.csv`, {
      headers: { Cookie: trainerCookie }
    });

    assert.equal(response.status, 403);
  });
});

await test("Noten-API erzwingt Rollen und Azubi-Ausbilder-Zuordnung", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const adminLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "admin",
    password: "admin123"
  });
  const adminCookie = extractCookie(adminLogin);

  const createTrainerResponse = await postJson(
    `${baseUrl}/api/admin/users`,
    {
      name: "Noten Ausbilder Zwei",
      username: "noten-ausbilder-zwei",
      email: "noten-ausbilder-zwei@example.com",
      password: "Trainerkonto123",
      role: "trainer",
      betrieb: "WIWEB"
    },
    adminCookie
  );
  assert.equal(createTrainerResponse.status, 200);

  const adminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: adminCookie }
  });
  const adminDashboard = await adminDashboardResponse.json();
  const demoTrainee = adminDashboard.users.find((user) => user.username === "azubi");
  const defaultTrainer = adminDashboard.users.find((user) => user.username === "trainer");
  const secondTrainer = adminDashboard.users.find((user) => user.username === "noten-ausbilder-zwei");

  assert.ok(demoTrainee);
  assert.ok(defaultTrainer);
  assert.ok(secondTrainer);

  const assignSecondTrainerResponse = await postJson(
    `${baseUrl}/api/admin/assign-trainer`,
    {
      traineeId: demoTrainee.id,
      trainerIds: [defaultTrainer.id, secondTrainer.id]
    },
    adminCookie
  );
  assert.equal(assignSecondTrainerResponse.status, 200);

  const adminCreateDemoGrade = await postJson(
    `${baseUrl}/api/grades`,
    {
      traineeId: demoTrainee.id,
      fach: "API Rechte",
      typ: "Schulaufgabe",
      bezeichnung: "Zugriff Demo-Azubi",
      datum: "2026-03-15",
      note: 2
    },
    adminCookie
  );
  assert.equal(adminCreateDemoGrade.status, 200);
  const adminDemoGrades = await adminCreateDemoGrade.json();
  const demoCreatedGrade = adminDemoGrades.grades.find((grade) => grade.bezeichnung === "Zugriff Demo-Azubi");
  assert.ok(demoCreatedGrade);

  const createForeignTraineeResponse = await postJson(
    `${baseUrl}/api/admin/users`,
    {
      name: "Fremder Azubi",
      username: "fremder-azubi",
      email: "fremder-azubi@example.com",
      password: "Azubikonto123",
      role: "trainee",
      ausbildung: "Fachinformatiker Systemintegration",
      betrieb: "WIWEB",
      trainerIds: [secondTrainer.id]
    },
    adminCookie
  );
  assert.equal(createForeignTraineeResponse.status, 200);

  const refreshedAdminDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Cookie: adminCookie }
  });
  const refreshedAdminDashboard = await refreshedAdminDashboardResponse.json();
  const foreignTrainee = refreshedAdminDashboard.users.find((user) => user.username === "fremder-azubi");
  assert.ok(foreignTrainee);

  const adminCreateForeignGrade = await postJson(
    `${baseUrl}/api/grades`,
    {
      traineeId: foreignTrainee.id,
      fach: "API Rechte",
      typ: "Stegreifaufgabe",
      bezeichnung: "Zugriff Fremd-Azubi",
      datum: "2026-03-16",
      note: 3
    },
    adminCookie
  );
  assert.equal(adminCreateForeignGrade.status, 200);
  const adminForeignGrades = await adminCreateForeignGrade.json();
  const foreignCreatedGrade = adminForeignGrades.grades.find((grade) => grade.bezeichnung === "Zugriff Fremd-Azubi");
  assert.ok(foreignCreatedGrade);

  const traineeLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });
  const traineeCookie = extractCookie(traineeLogin);

  const traineeOwnGradesResponse = await fetch(`${baseUrl}/api/grades`, {
    headers: { Cookie: traineeCookie }
  });
  assert.equal(traineeOwnGradesResponse.status, 200);
  const traineeOwnGrades = await traineeOwnGradesResponse.json();
  assert.equal(traineeOwnGrades.grades.some((grade) => grade.bezeichnung === "Zugriff Demo-Azubi"), true);

  const traineeForeignGradesResponse = await fetch(`${baseUrl}/api/grades?traineeId=${foreignTrainee.id}`, {
    headers: { Cookie: traineeCookie }
  });
  assert.equal(traineeForeignGradesResponse.status, 200);
  const traineeForeignGrades = await traineeForeignGradesResponse.json();
  assert.equal(traineeForeignGrades.traineeId, demoTrainee.id);
  assert.equal(traineeForeignGrades.grades.some((grade) => grade.bezeichnung === "Zugriff Fremd-Azubi"), false);

  const defaultTrainerLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "trainer",
    password: "trainer123"
  });
  const defaultTrainerCookie = extractCookie(defaultTrainerLogin);

  const defaultTrainerAssignedResponse = await fetch(`${baseUrl}/api/grades?traineeId=${demoTrainee.id}`, {
    headers: { Cookie: defaultTrainerCookie }
  });
  assert.equal(defaultTrainerAssignedResponse.status, 200);
  const defaultTrainerAssignedGrades = await defaultTrainerAssignedResponse.json();
  assert.equal(defaultTrainerAssignedGrades.grades.some((grade) => grade.bezeichnung === "Zugriff Demo-Azubi"), true);

  const defaultTrainerForbiddenResponse = await fetch(`${baseUrl}/api/grades?traineeId=${foreignTrainee.id}`, {
    headers: { Cookie: defaultTrainerCookie }
  });
  assert.equal(defaultTrainerForbiddenResponse.status, 403);

  const secondTrainerLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "noten-ausbilder-zwei",
    password: "Trainerkonto123"
  });
  const secondTrainerCookie = extractCookie(secondTrainerLogin);

  const secondTrainerDemoResponse = await fetch(`${baseUrl}/api/grades?traineeId=${demoTrainee.id}`, {
    headers: { Cookie: secondTrainerCookie }
  });
  assert.equal(secondTrainerDemoResponse.status, 200);
  const secondTrainerDemoGrades = await secondTrainerDemoResponse.json();
  assert.equal(secondTrainerDemoGrades.grades.some((grade) => grade.bezeichnung === "Zugriff Demo-Azubi"), true);

  const secondTrainerForeignResponse = await fetch(`${baseUrl}/api/grades?traineeId=${foreignTrainee.id}`, {
    headers: { Cookie: secondTrainerCookie }
  });
  assert.equal(secondTrainerForeignResponse.status, 200);
  const secondTrainerForeignGrades = await secondTrainerForeignResponse.json();
  assert.equal(secondTrainerForeignGrades.grades.some((grade) => grade.bezeichnung === "Zugriff Fremd-Azubi"), true);

  const adminReadForeignResponse = await fetch(`${baseUrl}/api/grades?traineeId=${foreignTrainee.id}`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(adminReadForeignResponse.status, 200);
  const adminReadForeignGrades = await adminReadForeignResponse.json();
  assert.equal(adminReadForeignGrades.grades.some((grade) => grade.bezeichnung === "Zugriff Fremd-Azubi"), true);

  const adminDeleteForeignResponse = await fetch(`${baseUrl}/api/grades/${foreignCreatedGrade.id}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie }
  });
  assert.equal(adminDeleteForeignResponse.status, 200);
  const adminDeleteForeignResult = await adminDeleteForeignResponse.json();
  assert.equal(adminDeleteForeignResult.grades.some((grade) => grade.id === foreignCreatedGrade.id), false);
  });
});

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
  assert.match(submittedError.error, /schreibgeschuetzt/i);

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
  assert.match(signedError.error, /Signierte Eintraege/);
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

await test("Produktion startet nicht mit Demo-Daten", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
  const prodDir = fs.mkdtempSync(path.join(os.tmpdir(), "berichtsheft-prod-test-"));
  const child = spawn("node", ["index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: "3211",
      NODE_ENV: "production",
      SESSION_SECRET: "test-secret-production",
      ENABLE_DEMO_DATA: "true",
      DATA_DIR: prodDir,
      DB_FILE: path.join(prodDir, "berichtsheft.db"),
      LEGACY_FILE: path.join(prodDir, "berichtsheft.json")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stderr = await new Promise((resolve) => {
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += String(chunk);
    });
    child.on("exit", () => resolve(errorOutput));
  });

  fs.rmSync(prodDir, { recursive: true, force: true });
  assert.match(stderr, /ENABLE_DEMO_DATA darf in Produktion nicht aktiviert sein/);
  });
});

await test("Azubi kann nur eigene Berichte als CSV exportieren", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const traineeLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "azubi",
      password: "azubi123"
    });
    const traineeCookie = extractCookie(traineeLogin);

    const createOwnDraftResponse = await postJson(
      `${baseUrl}/api/report/draft`,
      { dateFrom: "2026-04-09", dateTo: "2026-04-09", weekLabel: "CSV Eigenexport Test" },
      traineeCookie
    );
    const createOwnDraftData = await createOwnDraftResponse.json();
    assert.equal(createOwnDraftResponse.status, 200);

    const updateOwnDraftResponse = await postJson(
      `${baseUrl}/api/report/entry/${createOwnDraftData.entry.id}`,
      {
        weekLabel: "CSV Eigenexport Test",
        dateFrom: "2026-04-09",
        dateTo: "2026-04-09",
        betrieb: "Büro\nPrüfung mit Umlauten: ä ö ü ß",
        schule: ""
      },
      traineeCookie
    );
    assert.equal(updateOwnDraftResponse.status, 200);

    const adminLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "admin123"
    });
    const adminCookie = extractCookie(adminLogin);

    const createOtherTraineeResponse = await postJson(
      `${baseUrl}/api/admin/users`,
      {
        name: "CSV Fremd Azubi",
        username: "csv-fremd-azubi",
        email: "csv-fremd-azubi@example.com",
        password: "Passwort123!",
        role: "trainee",
        ausbildung: "Fachinformatiker Systemintegration",
        betrieb: "Fremdbetrieb",
        berufsschule: "BBS Fremd"
      },
      adminCookie
    );
    assert.equal(createOtherTraineeResponse.status, 200);

    const otherTraineeLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "csv-fremd-azubi",
      password: "Passwort123!"
    });
    const otherTraineeCookie = extractCookie(otherTraineeLogin);

    const createForeignDraftResponse = await postJson(
      `${baseUrl}/api/report/draft`,
      { dateFrom: "2026-04-10", dateTo: "2026-04-10", weekLabel: "CSV Fremder Bericht" },
      otherTraineeCookie
    );
    const createForeignDraftData = await createForeignDraftResponse.json();
    assert.equal(createForeignDraftResponse.status, 200);

    const updateForeignDraftResponse = await postJson(
      `${baseUrl}/api/report/entry/${createForeignDraftData.entry.id}`,
      {
        weekLabel: "CSV Fremder Bericht",
        dateFrom: "2026-04-10",
        dateTo: "2026-04-10",
        betrieb: "Darf nicht exportiert werden",
        schule: ""
      },
      otherTraineeCookie
    );
    assert.equal(updateForeignDraftResponse.status, 200);

    const exportResponse = await fetch(`${baseUrl}/api/report/csv`, {
      headers: { Cookie: traineeCookie }
    });
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type") || "", /text\/csv;\s*charset=utf-8/i);
    assert.match(exportResponse.headers.get("content-disposition") || "", /attachment; filename="berichtsheft-/i);

    const csvBuffer = Buffer.from(await exportResponse.arrayBuffer());
    assert.equal(csvBuffer[0], 0xEF);
    assert.equal(csvBuffer[1], 0xBB);
    assert.equal(csvBuffer[2], 0xBF);
    const csvText = csvBuffer.toString("utf8");
    assert.match(csvText, /"Datum";"Titel";"Status";"Betrieb";"Berufsschule";"Freigabestatus \/ Signaturstatus"/);
    assert.match(csvText, /CSV Eigenexport Test/);
    assert.match(csvText, /Büro\nPrüfung mit Umlauten: ä ö ü ß/);
    assert.match(csvText, /"Signiert"/);
    assert.match(csvText, /"Nicht eingereicht"/);
    assert.match(csvText, /""/);
    assert.doesNotMatch(csvText, /CSV Fremder Bericht/);
    assert.doesNotMatch(csvText, /Darf nicht exportiert werden/);
  });
});

await test("CSV-Export ist fuer Ausbilder ueber die Azubi-Route gesperrt", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const trainerLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "trainer",
      password: "trainer123"
    });
    const trainerCookie = extractCookie(trainerLogin);

    const response = await fetch(`${baseUrl}/api/report/csv`, {
      headers: { Cookie: trainerCookie }
    });

    assert.equal(response.status, 403);
  });
});
