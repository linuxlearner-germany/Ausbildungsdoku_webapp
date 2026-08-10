/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable("email_relay_settings", (table) => {
    table.integer("id").primary();
    table.boolean("enabled").notNullable().defaultTo(false);
    table.string("host", 255).notNullable().defaultTo("");
    table.integer("port").notNullable().defaultTo(587);
    table.boolean("secure").notNullable().defaultTo(false);
    table.boolean("require_tls").notNullable().defaultTo(true);
    table.string("username", 255).notNullable().defaultTo("");
    table.text("password_encrypted").nullable();
    table.string("from_address", 500).notNullable().defaultTo("");
    table.string("reply_to", 255).notNullable().defaultTo("");
    table.dateTime("updated_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
    table.integer("updated_by_user_id").nullable();
    table.foreign("updated_by_user_id").references("users.id");
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("email_relay_settings");
};
