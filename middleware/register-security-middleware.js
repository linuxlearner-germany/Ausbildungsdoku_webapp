const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { HttpError } = require("../utils/http-error");

function resolveHeaderOrigin(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch (_error) {
    return null;
  }
}

function registerSecurityMiddleware(app, { config, isProduction }) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  const loginIpRateLimiter = config.isTest ? null : rateLimit({
    windowMs: config.security.loginRateLimit.windowMs,
    limit: config.security.loginRateLimit.maxAttempts,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      error: {
        message: "Zu viele Login-Versuche. Bitte spaeter erneut versuchen.",
        code: "RATE_LIMITED"
      }
    }
  });

  app.use((req, res, next) => {
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
    }

    if (isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  });

  app.use("/api", (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }

    const requestOrigin = resolveHeaderOrigin(req.headers.origin) || resolveHeaderOrigin(req.headers.referer);
    if (!requestOrigin) {
      next();
      return;
    }

    const allowedOrigins = new Set([
      `${req.protocol}://${req.get("host")}`
    ]);

    if (config.app.baseUrl) {
      allowedOrigins.add(new URL(config.app.baseUrl).origin);
    }

    if (config.app.apiBaseUrl && /^https?:\/\//i.test(config.app.apiBaseUrl)) {
      allowedOrigins.add(new URL(config.app.apiBaseUrl).origin);
    }

    if (!allowedOrigins.has(requestOrigin)) {
      next(new HttpError(403, "Ungueltige Herkunft fuer API-Request.", { code: "ORIGIN_NOT_ALLOWED" }));
      return;
    }

    next();
  });

  app.use("/api/login", (req, res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }

    if (loginIpRateLimiter) {
      loginIpRateLimiter(req, res, next);
      return;
    }

    next();
  });
}

module.exports = {
  registerSecurityMiddleware
};
