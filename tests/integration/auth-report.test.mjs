import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import XLSX from "xlsx";
import { extractCookie, postJson, startServer } from "../helpers/test-server.mjs";

let nextPort = 3210;
let baseUrl = "";

async function withIsolatedServer(run, envOverrides = {}) {
  const port = nextPort;
  nextPort += 1;
  baseUrl = `http://127.0.0.1:${port}`;
  const server = await startServer(port, envOverrides);

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

await test("Login funktioniert mit gueltigem Admin", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const response = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "admin123"
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.user.username, "admin");
    assert.ok(extractCookie(response));
  });
});

await test("Admin-Login akzeptiert Benutzername und E-Mail case-insensitive", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const usernameResponse = await postJson(`${baseUrl}/api/login`, {
      identifier: "Admin",
      password: "admin123"
    });
    const usernameData = await usernameResponse.json();

    assert.equal(usernameResponse.status, 200);
    assert.equal(usernameData.user.username, "admin");
    assert.ok(extractCookie(usernameResponse));

    const emailResponse = await postJson(`${baseUrl}/api/login`, {
      identifier: "ADMIN@EXAMPLE.COM",
      password: "admin123"
    });
    const emailData = await emailResponse.json();

    assert.equal(emailResponse.status, 200);
    assert.equal(emailData.user.email, "admin@example.com");
    assert.ok(extractCookie(emailResponse));
  });
});

await test("Login mit falschem Admin-Passwort liefert klare Fehlermeldung", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const response = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "falsch"
    });
    const data = await response.json();

    assert.equal(response.status, 401);
    assert.equal(data.error.message, "E-Mail oder Passwort ist falsch.");
    assert.equal(data.error.code, "INVALID_CREDENTIALS");
  });
});

await test("Initial-Admin muss Passwort vor Fachzugriff aendern", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const loginResponse = await postJson(`${baseUrl}/api/login`, {
      identifier: "admin",
      password: "admin123"
    });
    const loginData = await loginResponse.json();
    const cookie = extractCookie(loginResponse);

    assert.equal(loginResponse.status, 200);
    assert.equal(loginData.user.passwordChangeRequired, true);

    const blockedDashboard = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: cookie }
    });
    const blockedData = await blockedDashboard.json();
    assert.equal(blockedDashboard.status, 403);
    assert.equal(blockedData.error.code, "PASSWORD_CHANGE_REQUIRED");

    const passwordChange = await postJson(
      `${baseUrl}/api/profile/password`,
      {
        currentPassword: "admin123",
        newPassword: "AdminNeu123!",
        newPasswordRepeat: "AdminNeu123!"
      },
      cookie
    );
    assert.equal(passwordChange.status, 200);

    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: cookie }
    });
    assert.equal(dashboardResponse.status, 200);
  }, {
    INITIAL_ADMIN_FORCE_PASSWORD_CHANGE: "true"
  });
});

await test("Login-Rate-Limit greift", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const identifier = `limit-${Date.now()}@example.com`;
    for (let index = 0; index < 3; index += 1) {
      const response = await postJson(`${baseUrl}/api/login`, {
        identifier,
        password: "falsch"
      });
      assert.equal(response.status, 401);
    }

    const blocked = await postJson(`${baseUrl}/api/login`, {
      identifier,
      password: "falsch"
    });
    const data = await blocked.json();

    assert.equal(blocked.status, 429);
    assert.equal(data.error.code, "RATE_LIMITED");
    assert.equal(blocked.headers.get("retry-after"), "60");
  }, {
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS: "3",
    LOGIN_RATE_LIMIT_WINDOW_MS: "60000"
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
    const uniqueOffset = Number(String(Date.now()).slice(-3));
    const firstBatchDate = new Date(Date.UTC(2035, 0, 1 + uniqueOffset));
    const secondBatchDate = new Date(firstBatchDate.getTime() + 24 * 60 * 60 * 1000);
    const toIsoDate = (value) => value.toISOString().slice(0, 10);

    const traineeLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "azubi",
      password: "azubi123"
    });
    const traineeCookie = extractCookie(traineeLogin);

    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: traineeCookie }
    });
    const dashboard = await dashboardResponse.json();

    const batchDrafts = [
      { dateFrom: toIsoDate(firstBatchDate), weekLabel: "Batch Rueckgabe Neu 1" },
      { dateFrom: toIsoDate(secondBatchDate), weekLabel: "Batch Rueckgabe Neu 2" }
    ];
    const createdEntryIds = [];

    for (const draftSeed of batchDrafts) {
      const draftResponse = await postJson(
        `${baseUrl}/api/report/draft`,
        { dateFrom: draftSeed.dateFrom, weekLabel: draftSeed.weekLabel, betrieb: "Support", schule: "" },
        traineeCookie
      );
      assert.equal(draftResponse.status, 200);
      const draft = await draftResponse.json();
      createdEntryIds.push(draft.entry.id);

      const updateResponse = await postJson(
        `${baseUrl}/api/report/entry/${draft.entry.id}`,
        { ...draft.entry, weekLabel: draftSeed.weekLabel, betrieb: "Support", schule: "" },
        traineeCookie
      );
      assert.equal(updateResponse.status, 200);
      await updateResponse.json();

      const submitResponse = await postJson(`${baseUrl}/api/report/submit`, { entryId: draft.entry.id }, traineeCookie);
      assert.equal(submitResponse.status, 200);
      await submitResponse.json();
    }

    const trainerLogin = await postJson(`${baseUrl}/api/login`, {
      identifier: "trainer",
      password: "trainer123"
    });
    const trainerCookie = extractCookie(trainerLogin);

    const batchResponse = await postJson(
      `${baseUrl}/api/trainer/batch`,
      { action: "reject", entryIds: createdEntryIds, reason: "Bitte nacharbeiten" },
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
    for (const entryId of createdEntryIds) {
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
    const readyResponse = await fetch(`${baseUrl}/api/ready`);
    const readyData = await readyResponse.json();

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.data.status, "live");
    assert.equal(readyResponse.status, 200);
    assert.equal(readyData.ok, true);
    assert.equal(readyData.data.status, "ready");
  });
});

await test("Azubi-Dashboard liefert Berichtsheftpflicht aus Ausbildungszeitraum und vorhandenen Tagen", { concurrency: false }, async () => {
  await withIsolatedServer(async () => {
    const loginResponse = await postJson(`${baseUrl}/api/login`, {
      identifier: "azubi",
      password: "azubi123"
    });
    const traineeCookie = extractCookie(loginResponse);

    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Cookie: traineeCookie }
    });
    assert.equal(dashboardResponse.status, 200);
    const dashboard = await dashboardResponse.json();

    assert.equal(dashboard.report.reportingProgress.trainingStartDate, "2026-03-01");
    assert.equal(dashboard.report.reportingProgress.trainingEndDate, "2029-02-28");
    assert.equal(dashboard.report.reportingProgress.calculationUntil, "2026-04-26");
    assert.equal(dashboard.report.reportingProgress.requiredWorkdays, 40);
    assert.equal(dashboard.report.reportingProgress.existingReportDays, 3);
    assert.equal(dashboard.report.reportingProgress.missingReportDays, 37);
  });
});
