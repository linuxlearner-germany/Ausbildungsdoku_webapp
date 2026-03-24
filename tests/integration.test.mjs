import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import XLSX from "xlsx";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "berichtsheft-test-"));
const port = 3210;
const baseUrl = `http://127.0.0.1:${port}`;

function startServer() {
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

let server;

test.before(async () => {
  server = await startServer();
});

test.after(() => {
  if (server) {
    server.kill("SIGTERM");
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Login funktioniert mit Demo-User", async () => {
  const response = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });

  assert.equal(response.status, 200);
  assert.ok(extractCookie(response));
});

test("Login-Rate-Limit greift", async () => {
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

test("Nur Entwuerfe koennen geloescht werden", async () => {
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

test("Signieren nur fuer eingereichte Eintraege", async () => {
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

test("Health-Endpoint ist erreichbar", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.status, "healthy");
});

test("Admin-User-Anlage verlangt gueltige E-Mail und starkes Passwort", async () => {
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

test("Admin kann Benutzer mit Benutzername anlegen", async () => {
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

test("Trainee kann Profil nicht ueber Report-Speichern aendern", async () => {
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

test("Trainer darf zugeordnetes Azubi-Profil aendern", async () => {
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

test("Trainee darf Profil-API nicht nutzen", async () => {
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

test("Theme-Praeferenz wird pro Benutzer gespeichert", async () => {
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

test("Import-Vorschau erkennt gueltige und doppelte Berichtstage", async () => {
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

test("Import legt Berichte als submitted an", async () => {
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

test("Produktion startet nicht mit Demo-Daten", async () => {
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
