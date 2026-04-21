const express = require("express");
const path = require("path");
const { createBootstrap } = require("../data/bootstrap");
const { createErrorHandler } = require("../middleware/error-handler");
const { registerCoreMiddleware } = require("../middleware/register-core-middleware");
const { registerSecurityMiddleware } = require("../middleware/register-security-middleware");
const { createSessionMiddleware } = require("../sessions/create-session-middleware");

function createApp({ config, db, dependencies }) {
  const app = express();
  const bootstrap = createBootstrap({
    dataDir: config.dataDir,
    legacyFile: config.legacyFile,
    db,
    enableDemoData: config.enableDemoData,
    ...dependencies.bootstrapHelpers
  });

  bootstrap.ensureStorage();
  bootstrap.run();

  registerCoreMiddleware(app, {
    config,
    sessionMiddleware: createSessionMiddleware({ config }),
    publicDir: config.publicDir,
    picturesDir: config.picturesDir
  });
  registerSecurityMiddleware(app, {
    isProduction: config.isProduction,
    loginRateLimiter: dependencies.loginRateLimiter
  });

  const { requireAuth, requireRole } = dependencies.authMiddleware;
  app.use("/api", dependencies.modules.auth.routes({ requireAuth }));
  app.use("/api", dependencies.modules.report.routes({ requireRole }));
  app.use("/api", dependencies.modules.admin.routes({ requireRole }));
  app.use("/api", dependencies.modules.grades.routes({ requireRole }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, status: "healthy" });
  });

  app.get("/api/dashboard", requireAuth, (req, res) => {
    res.json(dependencies.dashboardService.getDashboard(req.user));
  });

  app.get(/^\/(?!api(?:\/|$)|Pictures(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(config.publicDir, "index.html"));
  });

  app.use(createErrorHandler());
  return app;
}

module.exports = {
  createApp
};
