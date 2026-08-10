/** @param {import("knex").Knex} knex */
exports.up = async function up(knex) {
  if (await knex.schema.hasColumn("email_relay_settings", "html_enabled")) return;
  await knex.raw(`
    ALTER TABLE email_relay_settings
    ADD html_enabled bit NOT NULL
      CONSTRAINT DF_email_relay_settings_html_enabled DEFAULT (1) WITH VALUES
  `);
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasColumn("email_relay_settings", "html_enabled"))) return;
  await knex.raw(`
    ALTER TABLE email_relay_settings DROP CONSTRAINT DF_email_relay_settings_html_enabled;
    ALTER TABLE email_relay_settings DROP COLUMN html_enabled;
  `);
};

exports.config = {
  transaction: true
};
