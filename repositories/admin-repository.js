function createAdminRepository({
  db,
  parseTrainerIds,
  parseImportedDate,
  saveEducation,
  listUsersWithRelations,
  listEducations,
  deleteUserCascade,
  listAuditLogs,
  isTrainerAssignedToTrainee
}) {
  return {
    parseTrainerIds,
    parseImportedDate,
    saveEducation,
    listUsersWithRelations,
    listEducations,
    deleteUserCascade,
    listAuditLogs,
    isTrainerAssignedToTrainee,

    async findTraineeById(traineeId) {
      return db("users").select("id", "name", "role").where({ id: traineeId }).first();
    },

    async countMatchingTrainers(trainerIds) {
      if (!trainerIds.length) {
        return 0;
      }

      const row = await db("users")
        .where({ role: "trainer" })
        .whereIn("id", trainerIds)
        .count("* as count")
        .first();
      return Number(row?.count || 0);
    },

    async getTrainerIdsForTrainee(traineeId, trx = null) {
      const runner = trx || db;
      const rows = await runner("trainee_trainers").select("trainer_id").where({ trainee_id: traineeId });
      return rows.map((row) => row.trainer_id);
    },

    async syncTraineeTrainerAssignments(traineeId, trainerIds, trx = null) {
      const uniqueTrainerIds = [...new Set(trainerIds)];
      const existingIds = new Set(await this.getTrainerIdsForTrainee(traineeId, trx));

      const persistAssignments = async (runner) => {
        for (const trainerId of uniqueTrainerIds) {
          if (!existingIds.has(trainerId)) {
            await runner("trainee_trainers").insert({ trainee_id: traineeId, trainer_id: trainerId });
          }
        }

        for (const trainerId of existingIds) {
          if (!uniqueTrainerIds.includes(trainerId)) {
            await runner("trainee_trainers").where({ trainee_id: traineeId, trainer_id: trainerId }).del();
          }
        }
      };

      if (trx) {
        await persistAssignments(trx);
        return;
      }

      await db.transaction(async (transaction) => {
        await persistAssignments(transaction);
      });
    },

    async insertUser(user) {
      const [created] = await db("users").insert({
        name: user.name,
        username: user.username,
        email: user.email,
        password_hash: user.passwordHash,
        role: user.role,
        ausbildung: user.ausbildung,
        betrieb: user.betrieb,
        berufsschule: user.berufsschule,
        ausbildungs_start: user.ausbildungsStart || null,
        ausbildungs_ende: user.ausbildungsEnde || null,
        theme_preference: "system"
      }, ["id"]);
      return created;
    },

    async findUserForUpdate(userId) {
      return db("users")
        .select("id", "name", "username", "email", "role", "ausbildung", "betrieb", "berufsschule", "ausbildungs_start as ausbildungsStart", "ausbildungs_ende as ausbildungsEnde")
        .where({ id: userId })
        .first();
    },

    async updateUser(userId, user) {
      const payload = {
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        ausbildung: user.ausbildung,
        betrieb: user.betrieb,
        berufsschule: user.berufsschule,
        ausbildungs_start: user.ausbildungsStart || null,
        ausbildungs_ende: user.ausbildungsEnde || null
      };

      if (user.passwordHash) {
        payload.password_hash = user.passwordHash;
      }

      await db("users").where({ id: userId }).update(payload);
    },

    async deleteAssignmentsForTrainee(traineeId) {
      await db("trainee_trainers").where({ trainee_id: traineeId }).del();
    },

    async deleteAssignmentsForTrainer(trainerId) {
      await db("trainee_trainers").where({ trainer_id: trainerId }).del();
    },

    async findTraineeProfile(userId) {
      return db("users")
        .select("id", "name", "username", "email", "role", "ausbildung", "betrieb", "berufsschule", "ausbildungs_start as ausbildungsStart", "ausbildungs_ende as ausbildungsEnde")
        .where({ id: userId })
        .first();
    },

    async updateProfile(userId, profile) {
      await db("users").where({ id: userId }).update({
        name: profile.name,
        ausbildung: profile.ausbildung,
        betrieb: profile.betrieb,
        berufsschule: profile.berufsschule
      });
    },

    async getEmailRelaySettings() {
      return db("email_relay_settings").where({ id: 1 }).first();
    },

    async getEmailRelaySettingsWithPassword() {
      const row = await this.getEmailRelaySettings();
      if (!row) return null;
      return row;
    },

    async saveEmailRelaySettings(settings, actorId) {
      const payload = {
        id: 1,
        enabled: settings.enabled,
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        require_tls: settings.requireTls,
        username: settings.username,
        password_encrypted: settings.passwordEncrypted,
        from_address: settings.from,
        reply_to: settings.replyTo,
        updated_at: db.fn.now(),
        updated_by_user_id: actorId
      };
      const existing = await this.getEmailRelaySettings();
      if (existing) {
        await db("email_relay_settings").where({ id: 1 }).update(payload);
      } else {
        await db("email_relay_settings").insert(payload);
      }
    },

    async getGlobalUiSettings() {
      return db("global_ui_settings").where({ id: 1 }).first();
    },

    async saveLoginBackground(backgroundKey, actorId) {
      const payload = {
        id: 1,
        login_background_key: backgroundKey,
        updated_at: db.fn.now(),
        updated_by_user_id: actorId
      };
      const existing = await this.getGlobalUiSettings();
      if (existing) {
        await db("global_ui_settings").where({ id: 1 }).update(payload);
      } else {
        await db("global_ui_settings").insert(payload);
      }
    }
  };
}

module.exports = {
  createAdminRepository
};
