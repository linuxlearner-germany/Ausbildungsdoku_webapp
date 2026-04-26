import test from "node:test";
import assert from "node:assert/strict";
import { extractCookie, postJson, startServer } from "./helpers/test-server.mjs";

const port = 3211;
const baseUrl = `http://127.0.0.1:${port}`;

let server = null;

test.beforeEach(async () => {
  server = await startServer(port);
});

test.afterEach(async () => {
  if (server) {
    await new Promise((resolve) => {
      server.once("exit", resolve);
      server.kill("SIGTERM");
    });
    server = null;
  }
});

await test("Admin-Audit-Log erfasst Benutzeranlage und CSV-Import", async () => {
  const adminLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "admin",
    password: "admin123"
  });
  const adminCookie = extractCookie(adminLogin);

  const createUserResponse = await postJson(
    `${baseUrl}/api/admin/users`,
    {
      name: "Audit Trainer",
      username: "audit-trainer",
      email: "audit-trainer@example.com",
      password: "Passwort123!",
      role: "trainer"
    },
    adminCookie
  );
  assert.equal(createUserResponse.status, 200);

  const importCsv = [
    "name,username,email,role,password,ausbildung,betrieb,berufsschule,trainer_usernames",
    "Audit Import Ausbilder,audit-import-trainer,audit-import-trainer@example.com,trainer,Passwort123!,,,,",
    "Audit Import Azubi,audit-import-azubi,audit-import-azubi@example.com,trainee,Passwort123!,Fachinformatiker Systemintegration,Muster GmbH,BBS,audit-import-trainer"
  ].join("\n");

  const importResponse = await postJson(
    `${baseUrl}/api/admin/users/import`,
    {
      filename: "audit-import.csv",
      contentBase64: Buffer.from(importCsv, "utf8").toString("base64")
    },
    adminCookie
  );
  assert.equal(importResponse.status, 200);

  const auditResponse = await fetch(`${baseUrl}/api/admin/audit-logs?actionType=USER_CREATED&pageSize=10`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(auditResponse.status, 200);
  const auditData = await auditResponse.json();
  assert.equal(auditData.items.some((item) => item.summary.includes("Audit Trainer")), true);
  assert.equal(auditData.items.some((item) => item.summary.includes("Audit Import Azubi")), true);

  const importLogResponse = await fetch(`${baseUrl}/api/admin/audit-logs?actionType=CSV_IMPORT_EXECUTED&pageSize=5`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(importLogResponse.status, 200);
  const importLogData = await importLogResponse.json();
  assert.equal(importLogData.items[0].metadata.importedCount, 2);
});

await test("Audit-Log-API ist nur fuer Admins zugreifbar", async () => {
  const traineeLogin = await postJson(`${baseUrl}/api/login`, {
    identifier: "azubi",
    password: "azubi123"
  });
  const traineeCookie = extractCookie(traineeLogin);

  const response = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    headers: { Cookie: traineeCookie }
  });
  assert.equal(response.status, 403);
});
