const express = require("express");
const { createErrorHandler } = require("../middleware/error-handler");
const { registerCoreMiddleware } = require("../middleware/register-core-middleware");
const { registerSecurityMiddleware } = require("../middleware/register-security-middleware");
const { createSessionMiddleware } = require("../sessions/create-session-middleware");
const { createIndexHtmlRenderer } = require("./render-index-html");
const { HttpError } = require("../utils/http-error");
const { createApiSuccess } = require("../utils/api-response");

function createApp({ config, db, redisClient, dependencies, runtimeState, logger }) {
  const app = express();
  const web = express.Router();
  const renderIndexHtml = createIndexHtmlRenderer(config);

  registerCoreMiddleware(web, {
    config,
    sessionMiddleware: createSessionMiddleware({ config, redisClient }),
    publicDir: config.publicDir,
    picturesDir: config.picturesDir,
    logger
  });
  registerSecurityMiddleware(web, {
    config,
    isProduction: config.isProduction,
    loginRateLimiter: dependencies.loginRateLimiter
  });

  web.get("/api/live", (_req, res) => {
    res.json(createApiSuccess({
      status: runtimeState.isShuttingDown ? "shutting_down" : "live",
      uptimeMs: Date.now() - runtimeState.startedAt
    }));
  });

  web.get("/api/health", (_req, res) => {
    res.json(createApiSuccess({
      status: runtimeState.isShuttingDown ? "shutting_down" : "live",
      uptimeMs: Date.now() - runtimeState.startedAt,
      ready: runtimeState.isReady,
      dependencies: runtimeState.dependencies
    }));
  });

  web.get("/api/ready", async (_req, res, next) => {
    try {
      if (runtimeState.isShuttingDown || !runtimeState.isReady) {
        throw new HttpError(503, "Anwendung ist noch nicht bereit.", {
          code: "SERVICE_UNAVAILABLE",
          details: {
            shuttingDown: runtimeState.isShuttingDown,
            ready: runtimeState.isReady
          }
        });
      }

      await db.raw("SELECT 1 AS ok");
      await redisClient.ping();
      runtimeState.dependencies = {
        database: "up",
        redis: "up"
      };

      res.json(createApiSuccess({
        status: "ready",
        dependencies: runtimeState.dependencies
      }));
    } catch (error) {
      runtimeState.dependencies = {
        database: "unknown",
        redis: "unknown"
      };

      if (error instanceof HttpError) {
        next(error);
        return;
      }

      next(new HttpError(503, "Abhaengigkeiten sind nicht bereit.", {
        code: "DEPENDENCY_UNAVAILABLE",
        details: {
          dependencyMessage: error.message
        }
      }));
    }
  });

  const { requireAuth, requireRole } = dependencies.authMiddleware;
  web.use("/api", dependencies.modules.auth.routes({ requireAuth }));
  web.use("/api", dependencies.modules.report.routes({ requireRole }));
  web.use("/api", dependencies.modules.admin.routes({ requireRole }));
  web.use("/api", dependencies.modules.grades.routes({ requireRole }));

  web.get("/api/dashboard", requireAuth, async (req, res, next) => {
    try {
      res.json(await dependencies.dashboardService.getDashboard(req.user));
    } catch (error) {
      next(error);
    }
  });

  web.use("/api", (_req, _res, next) => {
    next(new HttpError(404, "API-Endpunkt nicht gefunden.", { code: "ROUTE_NOT_FOUND" }));
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

  app.use(createErrorHandler({ logger }));
  return app;
}

module.exports = {
  createApp
};
