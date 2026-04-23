const { createClient } = require("redis");

async function createRedisClient(config, { logger = console } = {}) {
  const client = createClient({
    url: config.redis.url,
    pingInterval: config.redis.pingIntervalMs,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: config.redis.connectTimeoutMs,
      reconnectStrategy(retryCount) {
        if (retryCount >= config.redis.maxRetries) {
          return new Error(`Redis-Reconnect-Limit erreicht (${config.redis.maxRetries}).`);
        }

        return Math.min((retryCount + 1) * 250, 2_000);
      }
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
    } else if (client.isReady || client.isOpen) {
      await client.disconnect().catch(() => {});
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
