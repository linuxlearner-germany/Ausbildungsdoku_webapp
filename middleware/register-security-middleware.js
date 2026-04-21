const helmet = require("helmet");

function registerSecurityMiddleware(app, { isProduction, loginRateLimiter }) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

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

  app.use("/api/login", (req, res, next) => {
    if (req.method === "POST" && loginRateLimiter?.isLoginRateLimited(req)) {
      return res.status(429).json({ error: "Zu viele Login-Versuche. Bitte spaeter erneut versuchen." });
    }

    next();
  });
}

module.exports = {
  registerSecurityMiddleware
};
