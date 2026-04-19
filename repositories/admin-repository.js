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

    findTraineeById(traineeId) {
      return db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(traineeId);
    },

    countMatchingTrainers(trainerIds) {
      if (!trainerIds.length) {
        return 0;
      }

      return db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'trainer' AND id IN (${trainerIds.map(() => "?").join(", ")})`).get(...trainerIds).count;
    },

    getTrainerIdsForTrainee(traineeId) {
      return db.prepare("SELECT trainer_id FROM trainee_trainers WHERE trainee_id = ?").all(traineeId).map((row) => row.trainer_id);
    },

    syncTraineeTrainerAssignments(traineeId, trainerIds) {
      const uniqueTrainerIds = [...new Set(trainerIds)];
      const existingIds = new Set(this.getTrainerIdsForTrainee(traineeId));
      const insertAssignment = db.prepare("INSERT OR IGNORE INTO trainee_trainers (trainee_id, trainer_id) VALUES (?, ?)");
      const deleteAssignment = db.prepare("DELETE FROM trainee_trainers WHERE trainee_id = ? AND trainer_id = ?");

      for (const trainerId of uniqueTrainerIds) {
        if (!existingIds.has(trainerId)) {
          insertAssignment.run(traineeId, trainerId);
        }
      }

      for (const trainerId of existingIds) {
        if (!uniqueTrainerIds.includes(trainerId)) {
          deleteAssignment.run(traineeId, trainerId);
        }
      }
    },

    insertUser(user) {
      return db.prepare(`
        INSERT INTO users (name, username, email, password_hash, role, trainer_id, ausbildung, betrieb, berufsschule)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
      `).run(user.name, user.username, user.email, user.passwordHash, user.role, user.ausbildung, user.betrieb, user.berufsschule);
    },

    findUserForUpdate(userId) {
      return db.prepare(`
        SELECT id, name, username, email, role, ausbildung, betrieb, berufsschule
        FROM users
        WHERE id = ?
      `).get(userId);
    },

    updateUser(userId, user) {
      if (user.passwordHash) {
        db.prepare(`
          UPDATE users
          SET name = ?, username = ?, email = ?, role = ?, ausbildung = ?, betrieb = ?, berufsschule = ?, trainer_id = NULL, password_hash = ?
          WHERE id = ?
        `).run(user.name, user.username, user.email, user.role, user.ausbildung, user.betrieb, user.berufsschule, user.passwordHash, userId);
        return;
      }

      db.prepare(`
        UPDATE users
        SET name = ?, username = ?, email = ?, role = ?, ausbildung = ?, betrieb = ?, berufsschule = ?, trainer_id = NULL
        WHERE id = ?
      `).run(user.name, user.username, user.email, user.role, user.ausbildung, user.betrieb, user.berufsschule, userId);
    },

    deleteAssignmentsForTrainee(traineeId) {
      db.prepare("DELETE FROM trainee_trainers WHERE trainee_id = ?").run(traineeId);
    },

    deleteAssignmentsForTrainer(trainerId) {
      db.prepare("DELETE FROM trainee_trainers WHERE trainer_id = ?").run(trainerId);
    },

    findTraineeProfile(userId) {
      return db.prepare(`
        SELECT id, name, username, email, role, ausbildung, betrieb, berufsschule
        FROM users
        WHERE id = ?
      `).get(userId);
    },

    updateProfile(userId, profile) {
      db.prepare(`
        UPDATE users
        SET name = ?, ausbildung = ?, betrieb = ?, berufsschule = ?
        WHERE id = ?
      `).run(profile.name, profile.ausbildung, profile.betrieb, profile.berufsschule, userId);
    }
  };
}

module.exports = {
  createAdminRepository
};
