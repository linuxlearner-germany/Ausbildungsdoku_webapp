import test from "node:test";
import assert from "node:assert/strict";
import { extractCookie, postJson, withIsolatedServer } from "./helpers/test-server.mjs";

async function login(baseUrl, identifier, password) {
  const response = await postJson(`${baseUrl}/api/login`, { identifier, password });
  return {
    response,
    cookie: extractCookie(response)
  };
}

async function assertOwnPasswordChangeWorks(baseUrl, identifier, currentPassword, newPassword) {
  const { cookie } = await login(baseUrl, identifier, currentPassword);
  const changeResponse = await postJson(
    `${baseUrl}/api/profile/password`,
    {
      currentPassword,
      newPassword,
      newPasswordRepeat: newPassword
    },
    cookie
  );
  assert.equal(changeResponse.status, 200);

  const oldLoginResponse = await postJson(`${baseUrl}/api/login`, {
    identifier,
    password: currentPassword
  });
  assert.equal(oldLoginResponse.status, 401);

  const newLoginResponse = await postJson(`${baseUrl}/api/login`, {
    identifier,
    password: newPassword
  });
  assert.equal(newLoginResponse.status, 200);
}

await test("Azubi kann eigenes Passwort aendern", { concurrency: false }, async () => {
  await withIsolatedServer(async (baseUrl) => {
    await assertOwnPasswordChangeWorks(baseUrl, "azubi", "azubi123", "AzubiNeu123!");
  });
});

await test("Ausbilder kann eigenes Passwort aendern", { concurrency: false }, async () => {
  await withIsolatedServer(async (baseUrl) => {
    await assertOwnPasswordChangeWorks(baseUrl, "trainer", "trainer123", "TrainerNeu123!");
  });
});

await test("Admin kann eigenes Passwort aendern", { concurrency: false }, async () => {
  await withIsolatedServer(async (baseUrl) => {
    await assertOwnPasswordChangeWorks(baseUrl, "admin", "admin123", "AdminNeu123!");
  });
});

await test("Fremde Passwortaenderung ueber manipulierte Ziel-ID wird blockiert", { concurrency: false }, async () => {
  await withIsolatedServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, "azubi", "azubi123");

    const bodyTamperResponse = await postJson(
      `${baseUrl}/api/profile/password`,
      {
        userId: 3,
        currentPassword: "azubi123",
        newPassword: "AzubiNeu123!",
        newPasswordRepeat: "AzubiNeu123!"
      },
      cookie
    );
    assert.equal(bodyTamperResponse.status, 403);

    const pathTamperResponse = await postJson(
      `${baseUrl}/api/profile/3/password`,
      {
        currentPassword: "azubi123",
        newPassword: "AzubiNeu123!",
        newPasswordRepeat: "AzubiNeu123!"
      },
      cookie
    );
    assert.equal(pathTamperResponse.status, 403);
  });
});

await test("Falsches aktuelles Passwort liefert einen sauberen Fehler", { concurrency: false }, async () => {
  await withIsolatedServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, "azubi", "azubi123");

    const response = await postJson(
      `${baseUrl}/api/profile/password`,
      {
        currentPassword: "falsch",
        newPassword: "AzubiNeu123!",
        newPasswordRepeat: "AzubiNeu123!"
      },
      cookie
    );
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error, "Aktuelles Passwort ist nicht korrekt.");
  });
});

await test("Zu kurzes neues Passwort wird abgewiesen", { concurrency: false }, async () => {
  await withIsolatedServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, "azubi", "azubi123");

    const response = await postJson(
      `${baseUrl}/api/profile/password`,
      {
        currentPassword: "azubi123",
        newPassword: "kurz",
        newPasswordRepeat: "kurz"
      },
      cookie
    );
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error, "Neues Passwort muss mindestens 10 Zeichen lang sein.");
  });
});

await test("Passwortwechsel erfordert eine Session", { concurrency: false }, async () => {
  await withIsolatedServer(async (baseUrl) => {
    const response = await postJson(`${baseUrl}/api/profile/password`, {
      currentPassword: "azubi123",
      newPassword: "AzubiNeu123!",
      newPasswordRepeat: "AzubiNeu123!"
    });
    assert.equal(response.status, 401);
  });
});
