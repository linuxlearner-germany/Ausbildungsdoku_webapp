import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createLoginRateLimiter } = require("../utils/login-rate-limit");

function createFakeRedisClient() {
  const values = new Map();
  const expires = new Map();

  function prune(key) {
    const expiresAt = expires.get(key);
    if (expiresAt && Date.now() > expiresAt) {
      values.delete(key);
      expires.delete(key);
    }
  }

  return {
    async get(key) {
      prune(key);
      return values.get(key) || null;
    },
    async incr(key) {
      prune(key);
      const next = Number(values.get(key) || 0) + 1;
      values.set(key, String(next));
      return next;
    },
    async pExpire(key, ttlMs) {
      expires.set(key, Date.now() + ttlMs);
      return true;
    },
    async pTTL(key) {
      prune(key);
      if (!values.has(key)) {
        return -2;
      }
      return Math.max(0, (expires.get(key) || Date.now()) - Date.now());
    },
    async del(...keys) {
      const list = keys.flat();
      let deleted = 0;
      for (const key of list) {
        deleted += values.delete(key) ? 1 : 0;
        expires.delete(key);
      }
      return deleted;
    },
    async *scanIterator({ MATCH }) {
      const prefix = MATCH.replace(/\*$/, "");
      for (const key of [...values.keys()]) {
        prune(key);
        if (key.startsWith(prefix)) {
          yield key;
        }
      }
    }
  };
}

function createRequest(identifier, ip = "127.0.0.1") {
  return {
    body: { identifier },
    headers: {},
    socket: { remoteAddress: ip }
  };
}

test("Login-Rate-Limiter zaehlt pro Identifier und kann gezielt geleert werden", async () => {
  const redisClient = createFakeRedisClient();
  const limiter = createLoginRateLimiter({
    redisClient,
    keyPrefix: "test:",
    loginWindowMs: 60_000,
    loginMaxAttempts: 2
  });
  const req = createRequest("Admin");

  assert.equal((await limiter.getLoginRateLimit(req)).limited, false);
  await limiter.recordLoginFailure(req);
  assert.equal((await limiter.getLoginRateLimit(req)).limited, false);
  await limiter.recordLoginFailure(req);

  const blocked = await limiter.getLoginRateLimit(req);
  assert.equal(blocked.limited, true);
  assert.equal(blocked.maxAttempts, 2);
  assert.equal(blocked.retryAfterSeconds, 60);

  assert.equal(await limiter.clearAllLoginFailures(), 1);
  assert.equal((await limiter.getLoginRateLimit(req)).limited, false);
});
