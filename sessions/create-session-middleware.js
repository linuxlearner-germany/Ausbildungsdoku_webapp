const session = require("express-session");
const { RedisStore } = require("connect-redis");

function createSessionMiddleware({ config, redisClient }) {
  const sessionConfig = {
    name: config.session.cookieName,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    proxy: Boolean(config.server.trustProxy),
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: config.session.sameSite,
      secure: config.session.secure,
      maxAge: config.session.maxAgeMs
    }
  };

  if (config.session.useRedisSessions) {
    sessionConfig.store = new RedisStore({
      client: redisClient,
      prefix: `${config.redis.keyPrefix}sess:`
    });
  }

  return session(sessionConfig);
}

module.exports = {
  createSessionMiddleware
};
