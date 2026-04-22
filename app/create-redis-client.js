const { createClient } = require("redis");

async function createRedisClient(config) {
  const client = createClient({
    url: config.redis.url
  });

  client.on("error", (error) => {
    console.error(`Redis-Fehler: ${error.message}`);
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
