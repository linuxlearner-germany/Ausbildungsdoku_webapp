import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import XLSX from "xlsx";
import { extractCookie, postJson, startServer } from "../helpers/test-server.mjs";
import { buildIntegrationTestEnv } from "../helpers/test-env.mjs";

let nextPort = 3510;
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

await test("Produktion startet nicht mit Demo-Daten", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const child = spawn("node", ["index.js"], {
      cwd: process.cwd(),
      env: buildIntegrationTestEnv({
        PORT: "3211",
        NODE_ENV: "production",
        SESSION_SECRET: "test-secret-production",
        INITIAL_ADMIN_PASSWORD: "AdminInitProd123!",
        ENABLE_DEMO_DATA: "true",
        BOOTSTRAP_DATABASE_ON_START: "true"
      }),
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stderr = await new Promise((resolve) => {
      let errorOutput = "";
      child.stderr.on("data", (chunk) => {
        errorOutput += String(chunk);
      });
      child.on("exit", () => resolve(errorOutput));
    });

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
