function createSharedRepository({ db, writeAuditLog }) {
  function normalizeEducationName(value) {
    return String(value || "").trim();
  }

  function parseTrainerIds(input) {
    if (!Array.isArray(input)) {
      return [];
    }

    return [...new Set(
      input
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )];
  }

  function listEducations() {
    return db.prepare(`
      SELECT id, name
      FROM educations
      ORDER BY name COLLATE NOCASE ASC
    `).all();
  }

  function saveEducation(name) {
    const normalized = normalizeEducationName(name);
    if (!normalized) {
      return "";
    }
    db.prepare("INSERT OR IGNORE INTO educations (name) VALUES (?)").run(normalized);
    return normalized;
  }

  function getTrainerIdsForTrainee(traineeId) {
    return db.prepare(`
      SELECT trainer_id
      FROM trainee_trainers
      WHERE trainee_id = ?
      ORDER BY trainer_id ASC
    `).all(traineeId).map((row) => row.trainer_id);
  }

  function getTraineeIdsForTrainer(trainerId) {
    return db.prepare(`
      SELECT trainee_id
      FROM trainee_trainers
      WHERE trainer_id = ?
      ORDER BY trainee_id ASC
    `).all(trainerId).map((row) => row.trainee_id);
  }

  function listUsersWithRelations() {
    const users = db.prepare(`
      SELECT id, name, username, email, role, ausbildung, betrieb, berufsschule,
             created_at AS createdAt,
             theme_preference AS themePreference
      FROM users
      ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'trainer' THEN 2 ELSE 3 END, name COLLATE NOCASE ASC
    `).all();

    const assignments = db.prepare(`
      SELECT trainee_id, trainer_id
      FROM trainee_trainers
    `).all();

    const userMap = new Map(users.map((user) => [user.id, {
      ...user,
      trainerIds: [],
      traineeIds: [],
      assignedTrainers: [],
      assignedTrainees: []
    }]));

    for (const assignment of assignments) {
      const trainee = userMap.get(assignment.trainee_id);
      const trainer = userMap.get(assignment.trainer_id);
      if (!trainee || !trainer) {
        continue;
      }

      trainee.trainerIds.push(trainer.id);
      trainee.assignedTrainers.push({ id: trainer.id, name: trainer.name, email: trainer.email });
      trainer.traineeIds.push(trainee.id);
      trainer.assignedTrainees.push({ id: trainee.id, name: trainee.name, email: trainee.email, ausbildung: trainee.ausbildung });
    }

    return users.map((user) => userMap.get(user.id));
  }

  function countAdmins() {
    return db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
  }

  function findUserForAdmin(userId) {
    return db.prepare(`
      SELECT id, name, username, email, role, ausbildung, betrieb, berufsschule, created_at AS createdAt
      FROM users
      WHERE id = ?
    `).get(userId);
  }

  function deleteUserCascade(actor, userId) {
    const targetUser = findUserForAdmin(userId);
    if (!targetUser) {
      return { error: "Benutzer nicht gefunden.", status: 404 };
    }

    if (actor?.id === userId) {
      return { error: "Das aktuell eingeloggte Admin-Konto kann nicht geloescht werden.", status: 400 };
    }

    if (targetUser.role === "admin" && countAdmins() <= 1) {
      return { error: "Der letzte verbleibende Admin kann nicht geloescht werden.", status: 400 };
    }

    const traineeTrainerAssignments = db.prepare("SELECT COUNT(*) AS count FROM trainee_trainers WHERE trainee_id = ? OR trainer_id = ?").get(userId, userId).count;
    const reportCount = db.prepare("SELECT COUNT(*) AS count FROM entries WHERE trainee_id = ?").get(userId).count;
    const gradeCount = db.prepare("SELECT COUNT(*) AS count FROM grades WHERE trainee_id = ?").get(userId).count;
    const legacyAssignmentCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE trainer_id = ?").get(userId).count;

    const transaction = db.transaction(() => {
      db.prepare("UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = ?").run(userId);
      db.prepare("UPDATE audit_logs SET target_user_id = NULL WHERE target_user_id = ?").run(userId);
      db.prepare("DELETE FROM entries WHERE trainee_id = ?").run(userId);
      db.prepare("DELETE FROM grades WHERE trainee_id = ?").run(userId);
      db.prepare("DELETE FROM trainee_trainers WHERE trainee_id = ? OR trainer_id = ?").run(userId, userId);
      db.prepare("UPDATE users SET trainer_id = NULL WHERE trainer_id = ?").run(userId);
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    });

    transaction();

    writeAuditLog({
      actor,
      actionType: "USER_DELETED",
      entityType: "user",
      entityId: String(targetUser.id),
      summary: `${targetUser.name} wurde geloescht.`,
      changes: {
        deletedUser: {
          before: {
            id: targetUser.id,
            name: targetUser.name,
            username: targetUser.username,
            email: targetUser.email,
            role: targetUser.role
          },
          after: null
        }
      },
      metadata: {
        deletedUserId: targetUser.id,
        deletedUsername: targetUser.username,
        deletedRole: targetUser.role,
        removedReports: reportCount,
        removedGrades: gradeCount,
        removedAssignments: traineeTrainerAssignments + legacyAssignmentCount
      }
    });

    return {
      ok: true,
      deletedUser: targetUser,
      cleanup: {
        removedReports: reportCount,
        removedGrades: gradeCount,
        removedAssignments: traineeTrainerAssignments + legacyAssignmentCount
      }
    };
  }

  function listTraineesForTrainer(trainerId) {
    return db.prepare(`
      SELECT users.id, users.name, users.username, users.email, users.ausbildung, users.betrieb, users.berufsschule
      FROM users
      JOIN trainee_trainers ON trainee_trainers.trainee_id = users.id
      WHERE users.role = 'trainee' AND trainee_trainers.trainer_id = ?
      ORDER BY users.name COLLATE NOCASE ASC
    `).all(trainerId);
  }

  function isTrainerAssignedToTrainee(trainerId, traineeId) {
    const assignment = db.prepare(`
      SELECT 1
      FROM trainee_trainers
      WHERE trainee_id = ? AND trainer_id = ?
      LIMIT 1
    `).get(traineeId, trainerId);
    return Boolean(assignment);
  }

  function getCurrentUserById(userId) {
    const user = db.prepare(`
      SELECT id, name, username, email, role, ausbildung, betrieb, berufsschule,
             theme_preference AS themePreference
      FROM users
      WHERE id = ?
    `).get(userId);

    if (!user) {
      return null;
    }

    if (user.role === "trainee") {
      user.trainerIds = getTrainerIdsForTrainee(user.id);
    }

    if (user.role === "trainer") {
      user.traineeIds = getTraineeIdsForTrainer(user.id);
    }

    return user;
  }

  function getCurrentUser(req) {
    if (!req.session.userId) {
      return null;
    }
    return getCurrentUserById(req.session.userId);
  }

  function listEntriesForTrainee(traineeId) {
    return db.prepare(`
      SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule,
             status, signedAt, signerName, trainerComment, rejectionReason,
             created_at AS createdAt, updated_at AS updatedAt
      FROM entries
      WHERE trainee_id = ?
      ORDER BY dateFrom DESC, id DESC
    `).all(traineeId);
  }

  function listGradesForTrainee(traineeId) {
    return db.prepare(`
      SELECT id, fach, typ, bezeichnung, datum, note, gewicht
      FROM grades
      WHERE trainee_id = ?
      ORDER BY datum DESC, id DESC
    `).all(traineeId);
  }

  function findTraineeById(traineeId) {
    return db.prepare(`
      SELECT id, name, username, email, ausbildung, betrieb, berufsschule
      FROM users
      WHERE id = ? AND role = 'trainee'
      LIMIT 1
    `).get(traineeId);
  }

  function findEntryById(traineeId, entryId) {
    return db.prepare(`
      SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule,
             status, signedAt, signerName, trainerComment, rejectionReason
      FROM entries
      WHERE trainee_id = ? AND id = ?
      LIMIT 1
    `).get(traineeId, entryId);
  }

  function findEntryByDate(traineeId, dateFrom) {
    return db.prepare(`
      SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule,
             status, signedAt, signerName, trainerComment, rejectionReason
      FROM entries
      WHERE trainee_id = ? AND dateFrom = ?
      LIMIT 1
    `).get(traineeId, dateFrom);
  }

  function findEntryWithOwnerById(entryId) {
    return db.prepare(`
      SELECT id, trainee_id, weekLabel, dateFrom, dateTo, betrieb, schule,
             status, signedAt, signerName, trainerComment, rejectionReason
      FROM entries
      WHERE id = ?
      LIMIT 1
    `).get(entryId);
  }

  function getExistingEntriesMap(traineeId) {
    const rows = db.prepare(`
      SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule,
             status, signedAt, signerName, trainerComment, rejectionReason
      FROM entries
      WHERE trainee_id = ?
    `).all(traineeId);
    return new Map(rows.map((row) => [row.id, row]));
  }

  function ensureUniqueEntryDates(traineeId, entries) {
    const seenDates = new Set();

    for (const entry of entries) {
      if (!entry.dateFrom) {
        continue;
      }

      if (seenDates.has(entry.dateFrom)) {
        return { error: `Pro Tag ist nur ein Tagesbericht erlaubt: ${entry.dateFrom}` };
      }

      seenDates.add(entry.dateFrom);
    }

    const conflictingEntry = db.prepare(`
      SELECT id, dateFrom
      FROM entries
      WHERE trainee_id = ? AND dateFrom = ? AND id != ?
      LIMIT 1
    `);

    for (const entry of entries) {
      if (!entry.dateFrom) {
        continue;
      }

      const conflict = conflictingEntry.get(traineeId, entry.dateFrom, entry.id);
      if (conflict) {
        return { error: `Fuer ${entry.dateFrom} existiert bereits ein Tagesbericht.` };
      }
    }

    return null;
  }

  return {
    normalizeEducationName,
    parseTrainerIds,
    listEducations,
    saveEducation,
    getTrainerIdsForTrainee,
    getTraineeIdsForTrainer,
    listUsersWithRelations,
    deleteUserCascade,
    listTraineesForTrainer,
    isTrainerAssignedToTrainee,
    getCurrentUserById,
    getCurrentUser,
    listEntriesForTrainee,
    listGradesForTrainee,
    findTraineeById,
    findEntryById,
    findEntryByDate,
    findEntryWithOwnerById,
    getExistingEntriesMap,
    ensureUniqueEntryDates
  };
}

module.exports = {
  createSharedRepository
};
