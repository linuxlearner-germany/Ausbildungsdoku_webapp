/**
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.string("ausbildungs_start", 10).nullable();
    table.string("ausbildungs_ende", 10).nullable();
  });

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT chk_users_ausbildungs_start_format
    CHECK (
      ausbildungs_start IS NULL
      OR ausbildungs_start LIKE '[1-2][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
    );
  `);

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT chk_users_ausbildungs_ende_format
    CHECK (
      ausbildungs_ende IS NULL
      OR ausbildungs_ende LIKE '[1-2][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'
    );
  `);

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT chk_users_ausbildungs_zeitraum
    CHECK (
      ausbildungs_start IS NULL
      OR ausbildungs_ende IS NULL
      OR ausbildungs_start <= ausbildungs_ende
    );
  `);
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.raw("ALTER TABLE users DROP CONSTRAINT chk_users_ausbildungs_zeitraum;");
  await knex.raw("ALTER TABLE users DROP CONSTRAINT chk_users_ausbildungs_ende_format;");
  await knex.raw("ALTER TABLE users DROP CONSTRAINT chk_users_ausbildungs_start_format;");

  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("ausbildungs_start");
    table.dropColumn("ausbildungs_ende");
  });
};
