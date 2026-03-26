import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

let nextPort = 3310;

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

async function postJson(baseUrl, pathname, body, cookie = "") {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

async function withIsolatedServer(run) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "berichtsheft-password-test-"));
  const port = nextPort;
  nextPort += 1;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = await startServer(tmpDir, port);

  try {
    await run(baseUrl);
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

async function login(baseUrl, identifier, password) {
  const response = await postJson(baseUrl, "/api/login", { identifier, password });
  return {
    response,
    cookie: extractCookie(response)
  };
}

async function assertOwnPasswordChangeWorks(baseUrl, identifier, currentPassword, newPassword) {
  const { cookie } = await login(baseUrl, identifier, currentPassword);
  const changeResponse = await postJson(
    baseUrl,
    "/api/profile/password",
    {
      currentPassword,
      newPassword,
      newPasswordRepeat: newPassword
    },
    cookie
  );
  assert.equal(changeResponse.status, 200);

  const oldLoginResponse = await postJson(baseUrl, "/api/login", {
    identifier,
    password: currentPassword
  });
  assert.equal(oldLoginResponse.status, 401);

  const newLoginResponse = await postJson(baseUrl, "/api/login", {
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
      baseUrl,
      "/api/profile/password",
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
      baseUrl,
      "/api/profile/3/password",
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
      baseUrl,
      "/api/profile/password",
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
      baseUrl,
      "/api/profile/password",
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
    const response = await postJson(baseUrl, "/api/profile/password", {
      currentPassword: "azubi123",
      newPassword: "AzubiNeu123!",
      newPasswordRepeat: "AzubiNeu123!"
    });
    assert.equal(response.status, 401);
  });
});
