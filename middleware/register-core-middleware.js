const express = require("express");

function registerCoreMiddleware(app, { config, sessionMiddleware, publicDir, picturesDir }) {
  if (config.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));
  app.use("/Pictures", express.static(picturesDir));
  app.use(sessionMiddleware);
  app.use(express.static(publicDir));
}

module.exports = {
  registerCoreMiddleware
};
