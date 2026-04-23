const session = require("express-session");
const { RedisStore } = require("connect-redis");

function createSessionMiddleware({ config, redisClient }) {
  if (!redisClient) {
    throw new Error("Redis-Client ist fuer Session-Middleware erforderlich.");
  }

  const sessionConfig = {
    name: config.session.cookieName,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    proxy: Boolean(config.server.trustProxy),
    rolling: true,
    unset: "destroy",
    cookie: {
      httpOnly: true,
      path: config.app.basePath || "/",
      sameSite: config.session.sameSite,
      secure: config.session.secure,
      maxAge: config.session.maxAgeMs
    },
    store: new RedisStore({
      client: redisClient,
      prefix: `${config.redis.keyPrefix}sess:`
    })
  };

  return session(sessionConfig);
}

module.exports = {
  createSessionMiddleware
};
