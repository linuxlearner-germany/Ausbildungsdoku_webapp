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

const relayPayload = {
  enabled: false,
  host: "smtp.example.test",
  port: 587,
  secure: false,
  requireTls: true,
  htmlEnabled: false,
  username: "",
  password: "",
  clearPassword: false,
  from: "noreply@example.test",
  replyTo: ""
};

await test("HTML-Mail-Format ist nur fuer Admins zugaenglich und bleibt nach Neustart gespeichert", { concurrency: false }, async () => {
  await withIsolatedServer(async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/admin/email-relay`)).status, 401);

    const trainerLogin = await postJson(`${baseUrl}/api/login`, { identifier: "trainer", password: "trainer123" });
    const trainerCookie = extractCookie(trainerLogin);
    assert.equal((await fetch(`${baseUrl}/api/admin/email-relay`, { headers: { Cookie: trainerCookie } })).status, 403);
    assert.equal((await putJson(`${baseUrl}/api/admin/email-relay`, relayPayload, trainerCookie)).status, 403);

    const adminLogin = await postJson(`${baseUrl}/api/login`, { identifier: "admin", password: "admin123" });
    const adminCookie = extractCookie(adminLogin);
    const initialResponse = await fetch(`${baseUrl}/api/admin/email-relay`, { headers: { Cookie: adminCookie } });
    assert.equal(initialResponse.status, 200);
    assert.equal((await initialResponse.json()).htmlEnabled, true);

    const savedResponse = await putJson(`${baseUrl}/api/admin/email-relay`, relayPayload, adminCookie);
    assert.equal(savedResponse.status, 200);
    assert.equal((await savedResponse.json()).settings.htmlEnabled, false);

    const auditResponse = await fetch(`${baseUrl}/api/admin/audit-logs?actionType=EMAIL_RELAY_UPDATED`, { headers: { Cookie: adminCookie } });
    const auditData = await auditResponse.json();
    assert.equal(auditResponse.status, 200);
    assert.equal(auditData.items[0].metadata.htmlEnabled, false);
    assert.equal(Object.hasOwn(auditData.items[0].metadata, "password"), false);
  });

  await withIsolatedServer(async (baseUrl) => {
    const adminLogin = await postJson(`${baseUrl}/api/login`, { identifier: "admin", password: "admin123" });
    const adminCookie = extractCookie(adminLogin);
    const loadedResponse = await fetch(`${baseUrl}/api/admin/email-relay`, { headers: { Cookie: adminCookie } });
    assert.equal(loadedResponse.status, 200);
    assert.equal((await loadedResponse.json()).htmlEnabled, false);
  }, { RESET_DATABASE_ON_START: "false" });
});
