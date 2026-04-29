const { createConfig } = require("./app/config");
const { createDb, verifyDbConnection } = require("./app/create-db");
const { createRedisClient } = require("./app/create-redis-client");
const { createDependencies } = require("./app/create-dependencies");
const { createApp } = require("./app/create-app");
const { runMigrations } = require("./app/run-migrations");
const { createBootstrap } = require("./data/bootstrap-mssql");
const { createLogger } = require("./utils/logger");

async function createRuntime() {
  // Zentrale Initialisierung: Konfiguration laden, Infra verbinden, Migrationen/Bootstrap ausführen.
  const config = createConfig();
  const logger = createLogger(config.app.logLevel, {
    service: "ausbildungsdoku-webapp",
    nodeEnv: config.nodeEnv
  });
  const db = createDb(config);
  let redisClient;
  const runtimeState = {
    startedAt: Date.now(),
    isReady: false,
    isShuttingDown: false,
    dependencies: {
      database: "starting",
      redis: "starting"
    }
  };

  try {
    redisClient = await createRedisClient(config, { logger });
    runtimeState.dependencies.redis = "up";
    await verifyDbConnection(db, config);
    runtimeState.dependencies.database = "up";

    if (config.bootstrap.applyMigrationsOnStart) {
      await runMigrations({ db });
    }

    const dependencies = createDependencies({ config, db, redisClient });
    const bootstrap = createBootstrap({
      db,
      config,
      hashPassword: dependencies.bootstrapHelpers.hashPassword,
      writeAuditLog: dependencies.auditHelpers.writeAuditLog
    });

    let bootstrapResult = null;
    if (config.bootstrap.bootstrapDatabaseOnStart) {
      bootstrapResult = await bootstrap.run({ reset: config.bootstrap.resetDatabaseOnStart });
    }

    const app = createApp({ config, db, redisClient, dependencies, runtimeState, logger });
    app.locals.bootstrap = bootstrapResult;
    runtimeState.isReady = true;

    async function shutdown() {
      runtimeState.isReady = false;
      runtimeState.isShuttingDown = true;
      runtimeState.dependencies.database = "down";
      runtimeState.dependencies.redis = "down";
      await Promise.allSettled([
        db.destroy(),
        redisClient.quit()
      ]);
    }

    return {
      app,
      db,
      redisClient,
      config,
      logger,
      runtimeState,
      dependencies,
      bootstrap,
      shutdown
    };
  } catch (error) {
    runtimeState.isReady = false;
    runtimeState.isShuttingDown = true;
    runtimeState.dependencies.database = "down";
    runtimeState.dependencies.redis = "down";
    await Promise.allSettled([
      db.destroy(),
      redisClient?.quit()
    ]);
    throw error;
  }
}

async function startServer(runtime) {
  return new Promise((resolve, reject) => {
    const server = runtime.app.listen(runtime.config.server.port, runtime.config.server.host, () => resolve(server));
    server.once("error", reject);
    // Timeouts werden nach dem Listen gesetzt, damit dieselben Werte in jedem Betriebsmodus gelten.
    server.requestTimeout = runtime.config.server.requestTimeoutMs;
    server.headersTimeout = runtime.config.server.headersTimeoutMs;
    server.keepAliveTimeout = runtime.config.server.keepAliveTimeoutMs;
  });
}

if (require.main === module) {
  (async () => {
    const runtime = await createRuntime();
    const server = await startServer(runtime);
    let shuttingDown = false;

    const close = async (signal) => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      // Readiness sofort zurücknehmen, bevor Verbindungen und HTTP-Server kontrolliert beendet werden.
      runtime.runtimeState.isShuttingDown = true;
      runtime.runtimeState.isReady = false;
      runtime.runtimeState.dependencies = {
        database: "down",
        redis: "down"
      };
      runtime.logger.info("Shutdown gestartet", { signal });

      const forceShutdownTimer = setTimeout(() => {
        runtime.logger.error("Shutdown-Timeout erreicht, Verbindungen werden hart beendet.", {
          timeoutMs: runtime.config.server.shutdownTimeoutMs
        });
        server.closeAllConnections?.();
      }, runtime.config.server.shutdownTimeoutMs);
      forceShutdownTimer.unref();

      server.closeIdleConnections?.();

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      clearTimeout(forceShutdownTimer);

      await runtime.shutdown();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      close("SIGINT").catch(async (error) => {
        runtime.logger.error("Shutdown fehlgeschlagen", { signal: "SIGINT", error });
        await runtime.shutdown();
        process.exit(1);
      });
    });
    process.on("SIGTERM", () => {
      close("SIGTERM").catch(async (error) => {
        runtime.logger.error("Shutdown fehlgeschlagen", { signal: "SIGTERM", error });
        await runtime.shutdown();
        process.exit(1);
      });
    });
    process.on("uncaughtException", async (error) => {
      runtime.logger.error("Unbehandelter Ausnahmefehler", { error });
      await runtime.shutdown();
      process.exit(1);
    });
    process.on("unhandledRejection", async (error) => {
      runtime.logger.error("Unbehandeltes Promise-Rejection", {
        error: error instanceof Error ? error : new Error(String(error))
      });
      await runtime.shutdown();
      process.exit(1);
    });

    runtime.logger.info("HTTP-Server gestartet", {
      host: runtime.config.server.host,
      port: runtime.config.server.port,
      basePath: runtime.config.app.basePath || "/"
    });
    if (runtime.config.bootstrap.enableDemoData) {
      runtime.logger.warn("Demo-Daten sind aktiviert.", {
        demoUsers: ["azubi@example.com", "trainer@example.com", "admin@example.com"]
      });
    }
    if (runtime.app.locals.bootstrap?.initialAdmin?.created) {
      runtime.logger.warn("Initialer Admin wurde angelegt.", {
        username: runtime.config.initialAdmin.username
      });
    }
  })().catch(async (error) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      message: "Startup fehlgeschlagen",
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    }));
    process.exit(1);
  });
}

module.exports = {
  createRuntime,
  startServer
};
