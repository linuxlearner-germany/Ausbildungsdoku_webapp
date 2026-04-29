const crypto = require("crypto");

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIpAddress(value) {
  return String(value || "unknown").trim() || "unknown";
}

function createLoginRateLimiter({ redisClient, keyPrefix, loginWindowMs, loginMaxAttempts }) {
  if (!redisClient) {
    throw new Error("Redis-Client ist fuer Login-Rate-Limiter erforderlich.");
  }

  const prefix = `${keyPrefix || ""}login-rate:`;

  function getClientIp(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  }

  function getLoginIdentifier(req) {
    return normalizeIdentifier(req.body?.identifier || req.body?.email || "");
  }

  function getKey(ipAddress, identifier) {
    const digest = crypto
      .createHash("sha256")
      .update(`${normalizeIpAddress(ipAddress)}\0${normalizeIdentifier(identifier)}`)
      .digest("hex");
    return `${prefix}${digest}`;
  }

  function getRequestKey(req) {
    return getKey(getClientIp(req), getLoginIdentifier(req));
  }

  async function deleteKeys(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    if (!list.length) {
      return 0;
    }

    return Number(await redisClient.del(...list));
  }

  async function getRetryAfterMs(key) {
    const ttlMs = typeof redisClient.pTTL === "function"
      ? await redisClient.pTTL(key)
      : await redisClient.pttl(key);
    return Number(ttlMs) > 0 ? Number(ttlMs) : 0;
  }

  function buildStatus({ count, retryAfterMs }) {
    const attempts = Number(count || 0);
    const remainingAttempts = Math.max(0, loginMaxAttempts - attempts);
    return {
      limited: attempts >= loginMaxAttempts && retryAfterMs > 0,
      count: attempts,
      maxAttempts: loginMaxAttempts,
      remainingAttempts,
      retryAfterMs,
      retryAfterSeconds: retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : 0
    };
  }

  async function getLoginRateLimit(req) {
    const key = getRequestKey(req);
    const rawCount = await redisClient.get(key);
    const count = Number(rawCount || 0);

    if (!count) {
      return buildStatus({ count: 0, retryAfterMs: 0 });
    }

    const retryAfterMs = await getRetryAfterMs(key);
    if (!retryAfterMs) {
      await deleteKeys(key);
      return buildStatus({ count: 0, retryAfterMs: 0 });
    }

    return buildStatus({ count, retryAfterMs });
  }

  async function isLoginRateLimited(req) {
    const status = await getLoginRateLimit(req);
    return status.limited;
  }

  async function recordLoginFailure(req) {
    const key = getRequestKey(req);
    const count = Number(await redisClient.incr(key));
    if (count === 1) {
      if (typeof redisClient.pExpire === "function") {
        await redisClient.pExpire(key, loginWindowMs);
      } else {
        await redisClient.pexpire(key, loginWindowMs);
      }
    }

    return buildStatus({
      count,
      retryAfterMs: await getRetryAfterMs(key)
    });
  }

  async function clearLoginFailures(req) {
    await deleteKeys(getRequestKey(req));
  }

  async function clearLoginFailuresForKey(ipAddress, identifier) {
    await deleteKeys(getKey(ipAddress, identifier));
  }

  async function clearAllLoginFailures() {
    const pattern = `${prefix}*`;
    let deleted = 0;
    let batch = [];

    async function flushBatch() {
      if (!batch.length) {
        return;
      }

      deleted += await deleteKeys(batch);
      batch = [];
    }

    if (typeof redisClient.scanIterator === "function") {
      for await (const item of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        const keys = Array.isArray(item) ? item : [item];
        batch.push(...keys);
        if (batch.length >= 100) {
          await flushBatch();
        }
      }
      await flushBatch();
      return deleted;
    }

    const keys = typeof redisClient.keys === "function" ? await redisClient.keys(pattern) : [];
    if (!keys.length) {
      return 0;
    }

    return deleteKeys(keys);
  }

  return {
    getClientIp,
    getLoginIdentifier,
    getLoginRateLimit,
    isLoginRateLimited,
    recordLoginFailure,
    clearLoginFailures,
    clearLoginFailuresForKey,
    clearAllLoginFailures
  };
}

module.exports = {
  createLoginRateLimiter
};
