import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAuthMiddleware } = require("../middleware/auth");

function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error));
  });
}

test("Pflicht-Passwortwechsel funktioniert auch unter APP_BASE_PATH", async () => {
  const { requireAuth } = createAuthMiddleware({
    async getCurrentUser() {
      return { id: 5, role: "admin", passwordChangeRequired: true };
    }
  });

  const error = await runMiddleware(requireAuth, {
    originalUrl: "/ausbildungsdoku/api/profile/password"
  });

  assert.equal(error, undefined);
});

test("Pflicht-Passwortwechsel sperrt Fachendpunkte weiterhin", async () => {
  const { requireAuth } = createAuthMiddleware({
    async getCurrentUser() {
      return { id: 5, role: "admin", passwordChangeRequired: true };
    }
  });

  const error = await runMiddleware(requireAuth, {
    originalUrl: "/ausbildungsdoku/api/dashboard"
  });

  assert.equal(error?.status, 403);
  assert.equal(error?.code, "PASSWORD_CHANGE_REQUIRED");
});
