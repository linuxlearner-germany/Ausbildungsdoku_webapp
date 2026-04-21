const { createConfig } = require("./app/config");

const config = createConfig();

module.exports = {
  development: {
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
    migrations: {
      tableName: "knex_migrations",
      directory: "./data/migrations"
    }
  }
};
