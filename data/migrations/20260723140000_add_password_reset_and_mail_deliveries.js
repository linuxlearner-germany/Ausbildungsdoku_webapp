/**
 * Additive Migration: bestehende Benutzer-, Berichts- und Notendaten bleiben unverändert.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("password_reset_tokens", (table) => {
    table.increments("id").primary();
    table.integer("user_id").notNullable();
    table.string("token_hash", 64).notNullable().unique();
    table.dateTime("expires_at", { precision: 3 }).notNullable();
    table.dateTime("used_at", { precision: 3 }).nullable();
    table.dateTime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
    table.index(["user_id", "expires_at"], "idx_password_reset_user_expiry");
    table.foreign("user_id").references("users.id");
  });

  await knex.schema.createTable("mail_deliveries", (table) => {
    table.increments("id").primary();
    table.integer("user_id").notNullable();
    table.string("mail_type", 80).notNullable();
    table.string("dedupe_key", 255).notNullable().unique();
    table.string("recipient_email", 255).notNullable();
    table.string("status", 20).notNullable();
    table.text("error_message").nullable();
    table.dateTime("sent_at", { precision: 3 }).nullable();
    table.dateTime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
    table.index(["user_id", "mail_type"], "idx_mail_delivery_user_type");
    table.foreign("user_id").references("users.id");
  });

  await knex.raw(`
    ALTER TABLE mail_deliveries
    ADD CONSTRAINT chk_mail_deliveries_status
    CHECK (status IN ('pending', 'sent', 'failed'));
  `);
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("mail_deliveries");
  await knex.schema.dropTableIfExists("password_reset_tokens");
};
