const { createConfig } = require("./app/config");

const config = createConfig();
const baseConfig = {
  client: "mssql",
  connection: {
    server: config.mssql.host,
    port: config.mssql.port,
    user: config.mssql.user,
    password: config.mssql.password,
    database: config.mssql.database,
    options: {
      encrypt: config.mssql.encrypt,
      trustServerCertificate: config.mssql.trustServerCertificate
    }
  },
  pool: {
    min: config.mssql.poolMin,
    max: config.mssql.poolMax
  },
  migrations: {
    tableName: "knex_migrations",
    directory: "./data/migrations"
  }
};

module.exports = {
  development: baseConfig,
  test: baseConfig,
  production: baseConfig
};
