import test from "node:test";
import assert from "node:assert/strict";
import { extractCookie, postJson, withIsolatedServer } from "../helpers/test-server.mjs";

async function putJson(url, body, cookie = "") {
  return fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

await test("Login-Hintergrund ist oeffentlich lesbar und nur durch Admins aenderbar", { concurrency: false }, async () => {
  await withIsolatedServer(async (baseUrl) => {
    const initialResponse = await fetch(`${baseUrl}/api/ui-settings/login-background`);
    assert.equal(initialResponse.status, 200);
    assert.equal((await initialResponse.json()).background, "standard");

    const unauthenticated = await putJson(`${baseUrl}/api/admin/ui-settings/login-background`, { background: "wiweb" });
    assert.equal(unauthenticated.status, 401);

    const trainerLogin = await postJson(`${baseUrl}/api/login`, { identifier: "trainer", password: "trainer123" });
    const trainerAttempt = await putJson(
      `${baseUrl}/api/admin/ui-settings/login-background`,
      { background: "wiweb" },
      extractCookie(trainerLogin)
    );
    assert.equal(trainerAttempt.status, 403);

    const adminLogin = await postJson(`${baseUrl}/api/login`, { identifier: "admin", password: "admin123" });
    const adminCookie = extractCookie(adminLogin);
    const invalid = await putJson(
      `${baseUrl}/api/admin/ui-settings/login-background`,
      { background: "nicht-vorhanden" },
      adminCookie
    );
    assert.equal(invalid.status, 400);

    const saved = await putJson(
      `${baseUrl}/api/admin/ui-settings/login-background`,
      { background: "modern-logo" },
      adminCookie
    );
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).background, "modern-logo");

    const publicResponse = await fetch(`${baseUrl}/api/ui-settings/login-background`);
    assert.equal(publicResponse.status, 200);
    assert.equal((await publicResponse.json()).background, "modern-logo");
  });
});
