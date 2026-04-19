function createLoginRateLimiter({ loginAttempts, loginWindowMs, loginMaxAttempts }) {
  function getClientIp(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  }

  function getLoginIdentifier(req) {
    return String(req.body?.identifier || req.body?.email || "").trim().toLowerCase();
  }

  function isLoginRateLimited(req) {
    const key = `${getClientIp(req)}:${getLoginIdentifier(req)}`;
    const now = Date.now();
    const entry = loginAttempts.get(key);
    if (!entry) {
      return false;
    }

    if (now > entry.resetAt) {
      loginAttempts.delete(key);
      return false;
    }

    return entry.count >= loginMaxAttempts;
  }

  function recordLoginFailure(req) {
    const key = `${getClientIp(req)}:${getLoginIdentifier(req)}`;
    const now = Date.now();
    const current = loginAttempts.get(key);

    if (!current || now > current.resetAt) {
      loginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
      return;
    }

    current.count += 1;
    loginAttempts.set(key, current);
  }

  function clearLoginFailures(req) {
    const key = `${getClientIp(req)}:${getLoginIdentifier(req)}`;
    loginAttempts.delete(key);
  }

  function clearLoginFailuresForKey(ipAddress, identifier) {
    const key = `${String(ipAddress || "unknown")}:${String(identifier || "").trim().toLowerCase()}`;
    loginAttempts.delete(key);
  }

  return {
    getClientIp,
    isLoginRateLimited,
    recordLoginFailure,
    clearLoginFailures,
    clearLoginFailuresForKey
  };
}

module.exports = {
  createLoginRateLimiter
};
