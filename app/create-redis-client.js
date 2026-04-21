const { createClient } = require("redis");

function createRedisClient(config) {
  if (!config.session.useRedisSessions) {
    return null;
  }

  const client = createClient({
    url: config.redis.url
  });

  client.on("error", (error) => {
    console.error(`Redis-Fehler: ${error.message}`);
  });

  client.connect().catch((error) => {
    console.error(`Redis-Verbindung fehlgeschlagen: ${error.message}`);
  });

  return client;
}

module.exports = {
  createRedisClient
};
