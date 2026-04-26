const knex = require("knex");

function createDb(config) {
  // Eine einzige Knex-Instanz kapselt die MSSQL-Verbindung inklusive Migrationen und Pool-Konfiguration.
  return knex({
    client: "mssql",
    connection: {
      server: config.mssql.host,
      port: config.mssql.port,
      user: config.mssql.user,
      password: config.mssql.password,
      database: config.mssql.database,
      connectionTimeout: config.mssql.connectionTimeoutMs,
      requestTimeout: config.mssql.requestTimeoutMs,
      appName: config.mssql.appName,
      options: {
        encrypt: config.mssql.encrypt,
        trustServerCertificate: config.mssql.trustServerCertificate
      }
    },
    pool: {
      min: config.mssql.poolMin,
      max: config.mssql.poolMax
    },
    acquireConnectionTimeout: config.mssql.connectionTimeoutMs,
    migrations: {
      tableName: "knex_migrations",
      directory: `${config.projectRoot}/data/migrations`
    },
    asyncStackTraces: !config.isProduction
  });
}

async function verifyDbConnection(db, config = null) {
  try {
    await db.raw("SELECT 1 AS ok");
  } catch (error) {
    if (!config) {
      throw error;
    }

    const message = `MSSQL-Verbindung fehlgeschlagen (${config.mssql.host}:${config.mssql.port}/${config.mssql.database}): ${error.message}`;
    const wrappedError = new Error(message);
    wrappedError.cause = error;
    throw wrappedError;
  }
}

module.exports = {
  createDb,
  verifyDbConnection
};
