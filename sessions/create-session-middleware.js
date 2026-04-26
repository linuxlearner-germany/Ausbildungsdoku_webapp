const session = require("express-session");
const { RedisStore } = require("connect-redis");

function createSessionMiddleware({ config, redisClient }) {
  if (!redisClient) {
    throw new Error("Redis-Client ist fuer Session-Middleware erforderlich.");
  }

  // Session-Daten liegen ausschließlich in Redis; die App selbst bleibt zustandslos.
  const store = new RedisStore({
    client: redisClient,
    prefix: `${config.redis.keyPrefix}sess:`,
    ttl: config.session.ttlSeconds,
    disableTouch: false
  });

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
      ...(config.session.cookieDomain ? { domain: config.session.cookieDomain } : {}),
      sameSite: config.session.sameSite,
      secure: config.session.secure,
      maxAge: config.session.maxAgeMs
    },
    store
  };

  return session(sessionConfig);
}

module.exports = {
  createSessionMiddleware
};
