const express = require("express");
const { createErrorHandler } = require("../middleware/error-handler");
const { registerCoreMiddleware } = require("../middleware/register-core-middleware");
const { registerSecurityMiddleware } = require("../middleware/register-security-middleware");
const { createSessionMiddleware } = require("../sessions/create-session-middleware");
const { createIndexHtmlRenderer } = require("./render-index-html");

function createApp({ config, db, redisClient, dependencies }) {
  const app = express();
  const web = express.Router();
  const renderIndexHtml = createIndexHtmlRenderer(config);

  registerCoreMiddleware(web, {
    config,
    sessionMiddleware: createSessionMiddleware({ config, redisClient }),
    publicDir: config.publicDir,
    picturesDir: config.picturesDir
  });
  registerSecurityMiddleware(web, {
    isProduction: config.isProduction,
    loginRateLimiter: dependencies.loginRateLimiter
  });

  const { requireAuth, requireRole } = dependencies.authMiddleware;
  web.use("/api", dependencies.modules.auth.routes({ requireAuth }));
  web.use("/api", dependencies.modules.report.routes({ requireRole }));
  web.use("/api", dependencies.modules.admin.routes({ requireRole }));
  web.use("/api", dependencies.modules.grades.routes({ requireRole }));

  web.get("/api/health", async (_req, res, next) => {
    try {
      await db.raw("SELECT 1 AS ok");
      const redisStatus = config.session.useRedisSessions
        ? (redisClient?.isReady ? "up" : redisClient?.isOpen ? "connecting" : "down")
        : "disabled";
      res.json({ ok: true, status: "healthy", dependencies: { database: "up", redis: redisStatus } });
    } catch (error) {
      next(error);
    }
  });

  web.get("/api/dashboard", requireAuth, async (req, res, next) => {
    try {
      res.json(await dependencies.dashboardService.getDashboard(req.user));
    } catch (error) {
      next(error);
    }
  });

  web.get(/^\/(?!api(?:\/|$)|Pictures(?:\/|$)).*/, (_req, res) => {
    res.type("html").send(renderIndexHtml());
  });

  if (config.app.basePath) {
    app.use(config.app.basePath, web);
    app.get("/", (_req, res) => {
      res.redirect(config.app.basePath);
    });
  } else {
    app.use(web);
  }

  app.use(createErrorHandler());
  return app;
}

module.exports = {
  createApp
};
