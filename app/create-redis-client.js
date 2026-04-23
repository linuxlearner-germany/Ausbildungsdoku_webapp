const { createClient } = require("redis");

async function createRedisClient(config, { logger = console } = {}) {
  const client = createClient({
    url: config.redis.url,
    socket: {
      connectTimeout: config.redis.connectTimeoutMs
    }
  });

  client.on("error", (error) => {
    logger.error("Redis-Fehler", {
      host: config.redis.host,
      port: config.redis.port,
      error
    });
  });

  try {
    await client.connect();
    await client.ping();
    return client;
  } catch (error) {
    if (client.isOpen) {
      await client.quit().catch(() => {});
    }

    const message = `Redis-Verbindung fehlgeschlagen (${config.redis.host}:${config.redis.port}): ${error.message}`;
    const wrappedError = new Error(message);
    wrappedError.cause = error;
    throw wrappedError;
  }
}

module.exports = {
  createRedisClient
};
