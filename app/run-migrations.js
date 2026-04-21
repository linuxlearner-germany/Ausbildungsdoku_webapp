async function runMigrations({ db }) {
  await db.migrate.latest();
}

module.exports = {
  runMigrations
};
