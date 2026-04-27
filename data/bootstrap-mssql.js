const crypto = require("crypto");

function createBootstrap({
  db,
  config,
  hashPassword
}) {
  async function saveEducation(name, trx = db) {
    const normalized = String(name || "").trim();
    if (!normalized) {
      return;
    }

    const existing = await trx("educations").where({ name: normalized }).first("id");
    if (!existing) {
      await trx("educations").insert({ name: normalized });
    }
  }

  async function ensureInitialAdmin(trx = db) {
    const username = config.initialAdmin.username;
    const email = config.initialAdmin.email.toLowerCase();
    const password = config.initialAdmin.password;

    const existing = await trx("users")
      .where({ username })
      .orWhere({ email })
      .first("id", "username", "email", "role");

    if (existing) {
      return { created: false, user: existing };
    }

    const [createdUser] = await trx("users")
      .insert({
        name: "Systemadministrator",
        username,
        email,
        password_hash: hashPassword(password),
        role: "admin",
        theme_preference: "system",
        ausbildung: "",
        betrieb: "Verwaltung",
        berufsschule: ""
      }, ["id", "username", "email", "role"]);

    return { created: true, user: createdUser };
  }

  async function resetInitialAdmin(trx = db) {
    const username = config.initialAdmin.username;
    const email = config.initialAdmin.email.toLowerCase();
    const password = config.initialAdmin.password;

    const existingByIdentity = await trx("users")
      .where({ username })
      .orWhere({ email })
      .first("id", "username", "email", "role", "name", "theme_preference");

    if (existingByIdentity) {
      if (existingByIdentity.role !== "admin") {
        throw new Error(`Konfigurierter Recovery-Admin kollidiert mit Nicht-Admin '${existingByIdentity.username}'.`);
      }

      await trx("users")
        .where({ id: existingByIdentity.id })
        .update({
          username,
          email,
          password_hash: hashPassword(password),
          role: "admin",
          name: existingByIdentity.name || "Systemadministrator",
          theme_preference: existingByIdentity.theme_preference || "system"
        });

      return {
        created: false,
        passwordReset: true,
        user: {
          id: existingByIdentity.id,
          username,
          email,
          role: "admin"
        }
      };
    }

    const anyAdmin = await trx("users")
      .where({ role: "admin" })
      .first("id", "username", "email", "role");

    const [createdUser] = await trx("users")
      .insert({
        name: "Systemadministrator",
        username,
        email,
        password_hash: hashPassword(password),
        role: "admin",
        theme_preference: "system",
        ausbildung: "",
        betrieb: "Verwaltung",
        berufsschule: ""
      }, ["id", "username", "email", "role"]);

    return {
      created: true,
      passwordReset: false,
      recovered: Boolean(anyAdmin),
      user: createdUser
    };
  }

  async function ensureDemoData(trx = db) {
    if (!config.bootstrap.enableDemoData) {
      return;
    }

    const existingUsers = await trx("users").select("id", "username", "email", "role");
    const userByUsername = new Map(existingUsers.map((user) => [user.username, user]));

    await saveEducation("Fachinformatiker/in Systemintegration", trx);

    const ensureUser = async (payload) => {
      const existing = userByUsername.get(payload.username);
      if (existing) {
        return existing;
      }

      const persisted = await trx("users")
        .where({ username: payload.username })
        .orWhere({ email: payload.email })
        .first("id", "username", "email", "role");
      if (persisted) {
        userByUsername.set(persisted.username, persisted);
        return persisted;
      }

      const [created] = await trx("users").insert(payload, ["id", "username", "email", "role"]);
      userByUsername.set(created.username, created);
      return created;
    };

    const trainer = await ensureUser({
      name: "Herr Ausbilder",
      username: "trainer",
      email: "trainer@example.com",
      password_hash: hashPassword("trainer123"),
        role: "trainer",
        theme_preference: "system",
        ausbildung: "",
        betrieb: "Muster GmbH",
        berufsschule: "",
        ausbildungs_start: null,
        ausbildungs_ende: null
      });

    const trainee = await ensureUser({
      name: "Max Mustermann",
      username: "azubi",
      email: "azubi@example.com",
      password_hash: hashPassword("azubi123"),
      role: "trainee",
      theme_preference: "system",
      ausbildung: "Fachinformatiker/in Systemintegration",
      betrieb: "Muster GmbH",
      berufsschule: "BBS",
      ausbildungs_start: "2026-03-01",
      ausbildungs_ende: "2029-02-28"
    });

    const assignment = await trx("trainee_trainers")
      .where({ trainee_id: trainee.id, trainer_id: trainer.id })
      .first("trainee_id");
    if (!assignment) {
      await trx("trainee_trainers").insert({ trainee_id: trainee.id, trainer_id: trainer.id });
    }

    const entries = [
      {
        id: crypto.randomUUID(),
        trainee_id: trainee.id,
        weekLabel: "Warenannahme begleitet",
        dateFrom: "2026-03-24",
        dateTo: "2026-03-24",
        betrieb: "Support",
        schule: "",
        status: "draft"
      },
      {
        id: crypto.randomUUID(),
        trainee_id: trainee.id,
        weekLabel: "PC-Arbeitsplatz eingerichtet",
        dateFrom: "2026-03-25",
        dateTo: "2026-03-25",
        betrieb: "Client Management",
        schule: "",
        status: "submitted"
      },
      {
        id: crypto.randomUUID(),
        trainee_id: trainee.id,
        weekLabel: "Netzwerkdokumentation nachgearbeitet",
        dateFrom: "2026-03-30",
        dateTo: "2026-03-30",
        betrieb: "Dokumentation",
        schule: "",
        status: "signed",
        signedAt: new Date("2026-03-31T09:00:00.000Z"),
        signerName: trainer.name,
        trainerComment: "Sauber dokumentiert."
      },
      {
        id: crypto.randomUUID(),
        trainee_id: trainee.id,
        weekLabel: "Störungserfassung verbessert",
        dateFrom: "2026-03-29",
        dateTo: "2026-03-29",
        betrieb: "Helpdesk",
        schule: "",
        status: "rejected",
        trainerComment: "Bitte technische Details ergänzen.",
        rejectionReason: "Bitte technische Details ergänzen."
      }
    ];

    for (const entry of entries) {
      const exists = await trx("entries")
        .where({ trainee_id: entry.trainee_id, dateFrom: entry.dateFrom })
        .first("id");

      if (!exists) {
        await trx("entries").insert({
          ...entry,
          themen: "",
          reflection: "",
          signerName: entry.signerName || "",
          trainerComment: entry.trainerComment || "",
          rejectionReason: entry.rejectionReason || ""
        });
      }
    }

    const existingGrade = await trx("grades")
      .where({ trainee_id: trainee.id, fach: "Netzwerktechnik", bezeichnung: "Subnetting Test" })
      .first("id");

    if (!existingGrade) {
      await trx("grades").insert({
        trainee_id: trainee.id,
        fach: "Netzwerktechnik",
        typ: "Schulaufgabe",
        bezeichnung: "Subnetting Test",
        datum: "2026-03-25",
        note: 2.0,
        gewicht: 2
      });
    }

    return { trainee, trainer };
  }

  async function resetDatabase() {
    await db.transaction(async (trx) => {
      await trx("audit_logs").del();
      await trx("grades").del();
      await trx("entries").del();
      await trx("trainee_trainers").del();
      await trx("educations").del();
      await trx("users").del();
    });
  }

  async function run({ reset = false } = {}) {
    if (reset) {
      await resetDatabase();
    }

    const initialAdmin = await ensureInitialAdmin();
    const demo = await ensureDemoData();
    return {
      initialAdmin,
      demo
    };
  }

  return {
    run,
    resetDatabase,
    ensureInitialAdmin,
    resetInitialAdmin,
    ensureDemoData
  };
}

module.exports = {
  createBootstrap
};
