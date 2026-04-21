const { createConfig } = require("./app/config");
const { createDb } = require("./app/create-db");
const { createDependencies } = require("./app/create-dependencies");
const { createApp } = require("./app/create-app");

const config = createConfig();
const db = createDb(config);
const dependencies = createDependencies({ config, db });
const app = createApp({ config, db, dependencies });

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, config.host, () => {
      server.ref();
      resolve(server);
    });
    server.once("error", reject);
  });
}

if (require.main === module) {
  (async () => {
    const candidatePorts = [config.port, 3010, 3011, 3012];
    let server = null;
    let activePort = null;
    let lastError = null;

    for (const port of candidatePorts) {
      try {
        server = await startServer(port);
        activePort = port;
        break;
      } catch (error) {
        lastError = error;
        if (error?.code !== "EADDRINUSE") {
          throw error;
        }
      }
    }

    if (!server) {
      throw lastError || new Error("Server konnte nicht gestartet werden.");
    }

    if (activePort !== config.port) {
      console.warn(`Port ${config.port} ist bereits belegt. Verwende stattdessen http://${config.host}:${activePort}`);
    }

    console.log(`Berichtsheft-App laeuft auf http://${config.host}:${activePort}`);
    if (config.enableDemoData) {
      console.log("Demo-Logins: azubi@example.com / azubi123 | trainer@example.com / trainer123 | admin@example.com / admin123");
    }
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { app, db, config, dependencies };
