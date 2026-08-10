/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.alterTable("email_relay_settings", (table) => {
    table.boolean("html_enabled").notNullable().defaultTo(true);
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable("email_relay_settings", (table) => {
    table.dropColumn("html_enabled");
  });
};

exports.config = {
  transaction: true
};
