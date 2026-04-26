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

  async function listEducations() {
    return db("educations")
      .select("id", "name")
      .orderByRaw("LOWER(name) ASC");
  }

  async function saveEducation(name, trx = db) {
    const normalized = normalizeEducationName(name);
    if (!normalized) {
      return "";
    }

    const existing = await trx("educations").where({ name: normalized }).first("id");
    if (!existing) {
      await trx("educations").insert({ name: normalized });
    }

    return normalized;
  }

  async function getTrainerIdsForTrainee(traineeId) {
    const rows = await db("trainee_trainers")
      .select("trainer_id")
      .where({ trainee_id: traineeId })
      .orderBy("trainer_id", "asc");
    return rows.map((row) => row.trainer_id);
  }

  async function getTraineeIdsForTrainer(trainerId) {
    const rows = await db("trainee_trainers")
      .select("trainee_id")
      .where({ trainer_id: trainerId })
      .orderBy("trainee_id", "asc");
    return rows.map((row) => row.trainee_id);
  }

  async function listUsersWithRelations() {
    const users = await db("users")
      .select(
        "id",
        "name",
        "username",
        "email",
        "role",
        "ausbildung",
        "betrieb",
        "berufsschule",
        "ausbildungs_start as ausbildungsStart",
        "ausbildungs_ende as ausbildungsEnde",
        "created_at as createdAt",
        "theme_preference as themePreference"
      )
      .orderByRaw("CASE role WHEN 'admin' THEN 1 WHEN 'trainer' THEN 2 ELSE 3 END")
      .orderByRaw("LOWER(name) ASC");

    const assignments = await db("trainee_trainers").select("trainee_id", "trainer_id");
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
      trainer.assignedTrainees.push({
        id: trainee.id,
        name: trainee.name,
        email: trainee.email,
        ausbildung: trainee.ausbildung
      });
    }

    return users.map((user) => userMap.get(user.id));
  }

  async function countAdmins() {
    const row = await db("users").where({ role: "admin" }).count("* as count").first();
    return Number(row?.count || 0);
  }

  async function findUserForAdmin(userId) {
    return db("users")
      .select("id", "name", "username", "email", "role", "ausbildung", "betrieb", "berufsschule", "ausbildungs_start as ausbildungsStart", "ausbildungs_ende as ausbildungsEnde", "created_at as createdAt")
      .where({ id: userId })
      .first();
  }

  async function deleteUserCascade(actor, userId) {
    const targetUser = await findUserForAdmin(userId);
    if (!targetUser) {
      return { error: "Benutzer nicht gefunden.", status: 404 };
    }

    if (actor?.id === userId) {
      return { error: "Das aktuell eingeloggte Admin-Konto kann nicht geloescht werden.", status: 400 };
    }

    if (targetUser.role === "admin" && await countAdmins() <= 1) {
      return { error: "Der letzte verbleibende Admin kann nicht geloescht werden.", status: 400 };
    }

    const [assignmentCountRow, reportCountRow, gradeCountRow] = await Promise.all([
      db("trainee_trainers").where("trainee_id", userId).orWhere("trainer_id", userId).count("* as count").first(),
      db("entries").where({ trainee_id: userId }).count("* as count").first(),
      db("grades").where({ trainee_id: userId }).count("* as count").first()
    ]);

    await db.transaction(async (trx) => {
      await trx("audit_logs").where({ actor_user_id: userId }).update({ actor_user_id: null });
      await trx("audit_logs").where({ target_user_id: userId }).update({ target_user_id: null });
      await trx("trainee_trainers").where({ trainee_id: userId }).del();
      await trx("trainee_trainers").where({ trainer_id: userId }).del();
      await trx("grades").where({ trainee_id: userId }).del();
      await trx("entries").where({ trainee_id: userId }).del();
      await trx("users").where({ id: userId }).del();
    });

    await writeAuditLog({
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
        removedReports: Number(reportCountRow?.count || 0),
        removedGrades: Number(gradeCountRow?.count || 0),
        removedAssignments: Number(assignmentCountRow?.count || 0)
      }
    });

    return {
      ok: true,
      deletedUser: targetUser,
      cleanup: {
        removedReports: Number(reportCountRow?.count || 0),
        removedGrades: Number(gradeCountRow?.count || 0),
        removedAssignments: Number(assignmentCountRow?.count || 0)
      }
    };
  }

  async function listTraineesForTrainer(trainerId) {
    // Trainer sehen nur Azubis, die explizit ueber trainee_trainers zugeordnet sind.
    return db("users")
      .join("trainee_trainers", "trainee_trainers.trainee_id", "users.id")
      .select("users.id", "users.name", "users.username", "users.email", "users.ausbildung", "users.betrieb", "users.berufsschule", "users.ausbildungs_start as ausbildungsStart", "users.ausbildungs_ende as ausbildungsEnde")
      .where("users.role", "trainee")
      .andWhere("trainee_trainers.trainer_id", trainerId)
      .orderByRaw("LOWER(users.name) ASC");
  }

  async function isTrainerAssignedToTrainee(trainerId, traineeId) {
    const assignment = await db("trainee_trainers")
      .where({ trainee_id: traineeId, trainer_id: trainerId })
      .first("trainee_id");
    return Boolean(assignment);
  }

  async function getCurrentUserById(userId) {
    const user = await db("users")
      .select(
        "id",
        "name",
        "username",
        "email",
        "role",
        "ausbildung",
        "betrieb",
        "berufsschule",
        "ausbildungs_start as ausbildungsStart",
        "ausbildungs_ende as ausbildungsEnde",
        "theme_preference as themePreference"
      )
      .where({ id: userId })
      .first();

    if (!user) {
      return null;
    }

    if (user.role === "trainee") {
      user.trainerIds = await getTrainerIdsForTrainee(user.id);
    }

    if (user.role === "trainer") {
      user.traineeIds = await getTraineeIdsForTrainer(user.id);
    }

    return user;
  }

  async function getCurrentUser(req) {
    if (!req.session?.userId) {
      return null;
    }

    return getCurrentUserById(req.session.userId);
  }

  async function listEntriesForTrainee(traineeId) {
    return db("entries")
      .select(
        "id",
        "weekLabel",
        "dateFrom",
        "dateTo",
        "betrieb",
        "schule",
        "status",
        "signedAt",
        "signerName",
        "trainerComment",
        "rejectionReason",
        "created_at as createdAt",
        "updated_at as updatedAt"
      )
      .where({ trainee_id: traineeId })
      .orderBy("dateFrom", "desc")
      .orderBy("id", "desc");
  }

  async function listGradesForTrainee(traineeId) {
    return db("grades")
      .select("id", "fach", "typ", "bezeichnung", "datum", "note", "gewicht")
      .where({ trainee_id: traineeId })
      .orderBy("datum", "desc")
      .orderBy("id", "desc");
  }

  async function findTraineeById(traineeId) {
    return db("users")
      .select("id", "name", "username", "email", "ausbildung", "betrieb", "berufsschule", "ausbildungs_start as ausbildungsStart", "ausbildungs_ende as ausbildungsEnde")
      .where({ id: traineeId, role: "trainee" })
      .first();
  }

  async function findEntryById(traineeId, entryId) {
    return db("entries")
      .select("id", "weekLabel", "dateFrom", "dateTo", "betrieb", "schule", "status", "signedAt", "signerName", "trainerComment", "rejectionReason")
      .where({ trainee_id: traineeId, id: entryId })
      .first();
  }

  async function findEntryByDate(traineeId, dateFrom) {
    return db("entries")
      .select("id", "weekLabel", "dateFrom", "dateTo", "betrieb", "schule", "status", "signedAt", "signerName", "trainerComment", "rejectionReason")
      .where({ trainee_id: traineeId, dateFrom })
      .first();
  }

  async function findEntryWithOwnerById(entryId) {
    return db("entries")
      .select("id", "trainee_id", "weekLabel", "dateFrom", "dateTo", "betrieb", "schule", "status", "signedAt", "signerName", "trainerComment", "rejectionReason")
      .where({ id: entryId })
      .first();
  }

  async function getExistingEntriesMap(traineeId) {
    const rows = await db("entries")
      .select("id", "weekLabel", "dateFrom", "dateTo", "betrieb", "schule", "status", "signedAt", "signerName", "trainerComment", "rejectionReason")
      .where({ trainee_id: traineeId });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async function ensureUniqueEntryDates(traineeId, entries) {
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

    for (const entry of entries) {
      if (!entry.dateFrom) {
        continue;
      }

      const conflict = await db("entries")
        .select("id", "dateFrom")
        .where({ trainee_id: traineeId, dateFrom: entry.dateFrom })
        .whereNot({ id: entry.id })
        .first();

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
