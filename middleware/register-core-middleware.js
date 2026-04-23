const express = require("express");
const crypto = require("crypto");

function registerCoreMiddleware(app, { config, sessionMiddleware, publicDir, picturesDir, logger = console }) {
  if (config.server.trustProxy) {
    app.set("trust proxy", config.server.trustProxy);
  }

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.locals.requestId = req.requestId;
    res.setHeader("X-Request-Id", req.requestId);

    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const payload = {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2))
      };

      if (!req.path.startsWith("/api/")) {
        return;
      }

      if (res.statusCode >= 500) {
        logger.error("API-Request abgeschlossen", payload);
        return;
      }

      if (res.statusCode >= 400) {
        logger.warn("API-Request abgeschlossen", payload);
        return;
      }

      logger.debug("API-Request abgeschlossen", payload);
    });

    next();
  });

  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));
  app.use("/Pictures", express.static(picturesDir));
  app.use(sessionMiddleware);
  app.use(express.static(publicDir, { index: false }));
}

module.exports = {
  registerCoreMiddleware
};
