function createAdminRepository({
  db,
  parseTrainerIds,
  saveEducation,
  listUsersWithRelations,
  listEducations,
  deleteUserCascade,
  listAuditLogs,
  isTrainerAssignedToTrainee
}) {
  return {
    parseTrainerIds,
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
    }
  };
}

module.exports = {
  createAdminRepository
};
