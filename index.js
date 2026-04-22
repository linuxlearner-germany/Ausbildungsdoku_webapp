const { createConfig } = require("./app/config");
const { createDb, verifyDbConnection } = require("./app/create-db");
const { createRedisClient } = require("./app/create-redis-client");
const { createDependencies } = require("./app/create-dependencies");
const { createApp } = require("./app/create-app");
const { runMigrations } = require("./app/run-migrations");
const { createBootstrap } = require("./data/bootstrap-mssql");

async function createRuntime() {
  const config = createConfig();
  const db = createDb(config);
  let redisClient;

  try {
    redisClient = await createRedisClient(config);
    await verifyDbConnection(db, config);

    if (config.bootstrap.applyMigrationsOnStart) {
      await runMigrations({ db });
    }

    const dependencies = createDependencies({ config, db });
    const bootstrap = createBootstrap({
      db,
      config,
      hashPassword: dependencies.bootstrapHelpers.hashPassword
    });

    let bootstrapResult = null;
    if (config.bootstrap.bootstrapDatabaseOnStart) {
      bootstrapResult = await bootstrap.run({ reset: config.bootstrap.resetDatabaseOnStart });
    }

    const app = createApp({ config, db, redisClient, dependencies });
    app.locals.bootstrap = bootstrapResult;

    async function shutdown() {
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
      dependencies,
      bootstrap,
      shutdown
    };
  } catch (error) {
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
      console.log(`${signal} empfangen. Server wird beendet...`);

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      await runtime.shutdown();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      close("SIGINT").catch(async (error) => {
        console.error(error);
        await runtime.shutdown();
        process.exit(1);
      });
    });
    process.on("SIGTERM", () => {
      close("SIGTERM").catch(async (error) => {
        console.error(error);
        await runtime.shutdown();
        process.exit(1);
      });
    });

    console.log(`Berichtsheft-App laeuft auf http://${runtime.config.server.host}:${runtime.config.server.port}${runtime.config.app.basePath || ""}`);
    if (runtime.config.bootstrap.enableDemoData) {
      console.log("Demo-Logins: azubi@example.com / azubi123 | trainer@example.com / trainer123 | admin@example.com / admin123");
    }
    if (runtime.app.locals.bootstrap?.initialAdmin?.created) {
      console.log(
        `Initialer Admin angelegt: ${runtime.config.initialAdmin.username} / ${runtime.config.initialAdmin.password}`
      );
    }
  })().catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createRuntime,
  startServer
};
