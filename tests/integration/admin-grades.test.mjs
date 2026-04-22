import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import XLSX from "xlsx";
import { extractCookie, postJson, startServer } from "../helpers/test-server.mjs";

let nextPort = 3310;
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
