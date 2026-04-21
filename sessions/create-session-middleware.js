const session = require("express-session");

function createSessionMiddleware({ config, store = null }) {
  const middlewareConfig = {
    name: config.sessionCookieName,
    secret: config.sessionSecret || "berichtsheft-dev-secret",
    resave: false,
    saveUninitialized: false,
    proxy: config.trustProxy,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      maxAge: 1000 * 60 * 60 * 8
    }
  };

  if (store) {
    middlewareConfig.store = store;
  }

  return session(middlewareConfig);
}

module.exports = {
  createSessionMiddleware
};
