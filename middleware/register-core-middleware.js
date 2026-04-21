const express = require("express");

function registerCoreMiddleware(app, { config, sessionMiddleware, publicDir, picturesDir }) {
  if (config.server.trustProxy) {
    app.set("trust proxy", config.server.trustProxy);
  }

  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));
  app.use("/Pictures", express.static(picturesDir));
  app.use(sessionMiddleware);
  app.use(express.static(publicDir, { index: false }));
}

module.exports = {
  registerCoreMiddleware
};
