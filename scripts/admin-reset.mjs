import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConfig } = require("../app/config");
const { createDb, verifyDbConnection } = require("../app/create-db");
const { createRedisClient } = require("../app/create-redis-client");
const { createBootstrap } = require("../data/bootstrap-mssql");
const { hashPassword } = require("../app/runtime-helpers");
const { createLoginRateLimiter } = require("../utils/login-rate-limit");

const config = createConfig();
const db = createDb(config);
let redisClient = null;

try {
  await verifyDbConnection(db, config);
  redisClient = await createRedisClient(config);
  const bootstrap = createBootstrap({ db, config, hashPassword });
  const loginRateLimiter = createLoginRateLimiter({
    redisClient,
    keyPrefix: config.redis.keyPrefix,
    loginWindowMs: config.security.loginRateLimit.windowMs,
    loginMaxAttempts: config.security.loginRateLimit.maxAttempts
  });
  const result = await bootstrap.resetInitialAdmin();
  const clearedLoginRateLimitKeys = await loginRateLimiter.clearAllLoginFailures();

  console.log(JSON.stringify({
    ok: true,
    action: result.created ? (result.recovered ? "created_recovery_admin" : "created_initial_admin") : "reset_existing_admin_password",
    user: result.user,
    rateLimit: {
      clearedKeys: clearedLoginRateLimitKeys
    }
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
} finally {
  await Promise.allSettled([
    db.destroy(),
    redisClient?.quit()
  ]);
}
