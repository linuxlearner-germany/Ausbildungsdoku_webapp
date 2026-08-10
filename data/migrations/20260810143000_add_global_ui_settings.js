exports.up = async function up(knex) {
  await knex.schema.createTable("global_ui_settings", (table) => {
    table.integer("id").primary();
    table.string("login_background_key", 64).notNullable().defaultTo("standard");
    table.dateTime("updated_at").notNullable().defaultTo(knex.fn.now());
    table.integer("updated_by_user_id").nullable();
    table.foreign("updated_by_user_id").references("users.id").onDelete("SET NULL");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("global_ui_settings");
};

exports.config = {
  transaction: true
};
