/**
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.boolean("password_change_required").notNullable().defaultTo(false);
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("password_change_required");
  });
};
