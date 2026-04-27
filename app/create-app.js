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

  async function getDependencyStatus() {
    const dependencyState = {
      database: "unknown",
      redis: "unknown"
    };

    try {
      await db.raw("SELECT 1 AS ok");
      dependencyState.database = "up";
    } catch (_error) {
      dependencyState.database = "down";
    }

    try {
      await redisClient.ping();
      dependencyState.redis = "up";
    } catch (_error) {
      dependencyState.redis = "down";
    }

    runtimeState.dependencies = dependencyState;
    return dependencyState;
  }

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

      const dependencyState = await getDependencyStatus();
      if (dependencyState.database !== "up" || dependencyState.redis !== "up") {
        throw new HttpError(503, "Abhaengigkeiten sind nicht bereit.", {
          code: "DEPENDENCY_UNAVAILABLE",
          details: {
            dependencies: dependencyState
          }
        });
      }

      res.json(createApiSuccess({
        status: "ready",
        dependencies: dependencyState
      }));
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
        return;
      }

      const dependencyState = await getDependencyStatus();
      logger.error("Readiness-Pruefung fehlgeschlagen", {
        error,
        dependencies: dependencyState
      });

      next(new HttpError(503, "Abhaengigkeiten sind nicht bereit.", {
        code: "DEPENDENCY_UNAVAILABLE",
        details: {
          dependencyMessage: error.message,
          dependencies: dependencyState
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
