/**
 * Optionale Absenderadresse pro Administrationskonto. SMTP-Zugangsdaten
 * bleiben bewusst in der Server-Konfiguration und werden nicht gespeichert.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.string("relay_email", 255).nullable();
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("relay_email");
  });
};
