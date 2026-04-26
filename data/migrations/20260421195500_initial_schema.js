/**
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable("users", (table) => {
    table.increments("id").primary();
    table.string("name", 200).notNullable();
    table.string("username", 120).notNullable().unique();
    table.string("email", 255).notNullable().unique();
    table.string("password_hash", 255).notNullable();
    table.string("role", 20).notNullable();
    table.string("theme_preference", 20).notNullable().defaultTo("system");
    table.string("ausbildung", 255).notNullable().defaultTo("");
    table.string("betrieb", 255).notNullable().defaultTo("");
    table.string("berufsschule", 255).notNullable().defaultTo("");
    table.dateTime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT chk_users_role
    CHECK (role IN ('trainee', 'trainer', 'admin'));
  `);

  await knex.raw(`
    ALTER TABLE users
    ADD CONSTRAINT chk_users_theme_preference
    CHECK (theme_preference IN ('light', 'dark', 'system'));
  `);

  await knex.schema.createTable("educations", (table) => {
    table.increments("id").primary();
    table.string("name", 255).notNullable().unique();
    table.dateTime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("trainee_trainers", (table) => {
    table.integer("trainee_id").notNullable();
    table.integer("trainer_id").notNullable();
    table.dateTime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
    table.primary(["trainee_id", "trainer_id"]);
  });

  await knex.schema.createTable("entries", (table) => {
    table.string("id", 64).primary();
    table.integer("trainee_id").notNullable();
    table.string("weekLabel", 255).notNullable().defaultTo("");
    table.string("dateFrom", 10).notNullable().defaultTo("");
    table.string("dateTo", 10).notNullable().defaultTo("");
    table.string("betrieb", 255).notNullable().defaultTo("");
    table.string("schule", 255).notNullable().defaultTo("");
    table.text("themen").notNullable().defaultTo("");
    table.text("reflection").notNullable().defaultTo("");
    table.string("status", 20).notNullable().defaultTo("draft");
    table.dateTime("signedAt", { precision: 3 }).nullable();
    table.string("signerName", 255).notNullable().defaultTo("");
    table.text("trainerComment").notNullable().defaultTo("");
    table.text("rejectionReason").notNullable().defaultTo("");
    table.dateTime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
    table.dateTime("updated_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
    table.index(["trainee_id", "status"], "idx_entries_trainee_status");
    table.index(["trainee_id", "dateFrom"], "idx_entries_trainee_datefrom");
  });

  await knex.raw(`
    ALTER TABLE entries
    ADD CONSTRAINT chk_entries_status
    CHECK (status IN ('draft', 'submitted', 'signed', 'rejected'));
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX idx_entries_trainee_date
    ON entries (trainee_id, dateFrom)
    WHERE dateFrom <> '';
  `);

  await knex.schema.createTable("grades", (table) => {
    table.increments("id").primary();
    table.integer("trainee_id").notNullable();
    table.string("fach", 120).notNullable().defaultTo("");
    table.string("typ", 40).notNullable();
    table.string("bezeichnung", 255).notNullable().defaultTo("");
    table.string("datum", 10).notNullable().defaultTo("");
    table.decimal("note", 4, 2).notNullable();
    table.integer("gewicht").notNullable();
    table.dateTime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
    table.dateTime("updated_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
    table.index(["trainee_id", "fach", "datum"], "idx_grades_trainee_subject_date");
  });

  await knex.raw(`
    ALTER TABLE grades
    ADD CONSTRAINT chk_grades_typ
    CHECK (typ IN ('Schulaufgabe', 'Stegreifaufgabe'));
  `);

  await knex.raw(`
    ALTER TABLE grades
    ADD CONSTRAINT chk_grades_note
    CHECK (note >= 1.00 AND note <= 6.00);
  `);

  await knex.raw(`
    ALTER TABLE grades
    ADD CONSTRAINT chk_grades_gewicht
    CHECK (gewicht > 0);
  `);

  await knex.schema.createTable("audit_logs", (table) => {
    table.increments("id").primary();
    table.dateTime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now());
    table.integer("actor_user_id").nullable();
    table.string("actor_name", 255).notNullable().defaultTo("");
    table.string("actor_role", 40).notNullable().defaultTo("");
    table.string("action_type", 80).notNullable();
    table.string("entity_type", 80).notNullable();
    table.string("entity_id", 64).notNullable().defaultTo("");
    table.integer("target_user_id").nullable();
    table.string("summary", 500).notNullable().defaultTo("");
    table.text("changes_json").nullable();
    table.text("metadata_json").nullable();
  });

  await knex.schema.alterTable("audit_logs", (table) => {
    table.foreign("actor_user_id").references("users.id");
    table.foreign("target_user_id").references("users.id");
    table.index(["created_at"], "idx_audit_logs_created_at");
    table.index(["action_type"], "idx_audit_logs_action_type");
    table.index(["actor_user_id"], "idx_audit_logs_actor_user_id");
    table.index(["target_user_id"], "idx_audit_logs_target_user_id");
  });

  await knex.schema.alterTable("trainee_trainers", (table) => {
    table.foreign("trainee_id").references("users.id");
    table.foreign("trainer_id").references("users.id");
    table.index(["trainer_id"], "idx_trainee_trainers_trainer");
  });

  await knex.schema.alterTable("entries", (table) => {
    table.foreign("trainee_id").references("users.id").onDelete("CASCADE");
  });

  await knex.schema.alterTable("grades", (table) => {
    table.foreign("trainee_id").references("users.id").onDelete("CASCADE");
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.dropTableIfExists("grades");
  await knex.schema.dropTableIfExists("entries");
  await knex.schema.dropTableIfExists("trainee_trainers");
  await knex.schema.dropTableIfExists("educations");
  await knex.schema.dropTableIfExists("users");
};

exports.config = {
  transaction: false
};
