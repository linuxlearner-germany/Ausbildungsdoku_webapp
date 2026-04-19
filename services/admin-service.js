const { HttpError } = require("../utils/http-error");

function createAdminService({ adminRepository, helpers }) {
  function validateAdminUserPayload(input, { requirePassword = false } = {}) {
    const result = helpers.validateAdminUserPayload(input, { requirePassword });
    if (result.error) {
      throw new HttpError(400, result.error);
    }
    return result.data;
  }

  function validateProfilePayload(input) {
    const result = helpers.validateProfilePayload(input);
    if (result.error) {
      throw new HttpError(400, result.error);
    }
    return result.data;
  }

  function createUser(actor, payload) {
    const data = validateAdminUserPayload(payload, { requirePassword: true });
    const matchingTrainerCount = adminRepository.countMatchingTrainers(data.trainerIds);
    if (matchingTrainerCount !== data.trainerIds.length) {
      throw new HttpError(400, "Mindestens ein ausgewaehlter Ausbilder wurde nicht gefunden.");
    }

    try {
      const insertResult = adminRepository.insertUser({
        ...data,
        passwordHash: helpers.hashPassword(data.password)
      });
      const createdUserId = insertResult.lastInsertRowid;
      adminRepository.saveEducation(data.ausbildung);

      if (data.role === "trainee") {
        adminRepository.syncTraineeTrainerAssignments(createdUserId, data.trainerIds);
        helpers.logTrainerAssignmentChanges({
          actor,
          traineeId: createdUserId,
          traineeName: data.name,
          beforeTrainerIds: [],
          afterTrainerIds: data.trainerIds
        });
      }

      helpers.writeAuditLog({
        actor,
        actionType: "USER_CREATED",
        entityType: "user",
        entityId: String(createdUserId),
        targetUserId: createdUserId,
        summary: `${data.name} wurde als ${data.role} angelegt.`,
        metadata: {
          username: data.username,
          email: data.email,
          role: data.role,
          ausbildung: data.ausbildung
        }
      });

      return { ok: true };
    } catch (_error) {
      throw new HttpError(400, "Benutzer konnte nicht angelegt werden. Benutzername oder E-Mail existiert bereits.");
    }
  }

  function assignTrainer(actor, payload) {
    const trainee = adminRepository.findTraineeById(payload.traineeId);
    if (!trainee || trainee.role !== "trainee") {
      throw new HttpError(404, "Azubi nicht gefunden.");
    }

    const trainerIds = adminRepository.parseTrainerIds(payload.trainerIds);
    const matchingTrainerCount = adminRepository.countMatchingTrainers(trainerIds);
    if (matchingTrainerCount !== trainerIds.length) {
      throw new HttpError(400, "Mindestens ein ausgewaehlter Ausbilder wurde nicht gefunden.");
    }

    const previousTrainerIds = adminRepository.getTrainerIdsForTrainee(payload.traineeId);
    adminRepository.syncTraineeTrainerAssignments(payload.traineeId, trainerIds);
    helpers.logTrainerAssignmentChanges({
      actor,
      traineeId: payload.traineeId,
      traineeName: trainee?.name || "Azubi",
      beforeTrainerIds: previousTrainerIds,
      afterTrainerIds: trainerIds
    });

    return { ok: true };
  }

  function previewImport(payload) {
    const preview = helpers.buildUserImportPreview(payload);
    if (preview.error) {
      throw new HttpError(400, preview.error);
    }
    return preview;
  }

  function importUsers(actor, payload) {
    const preview = previewImport(payload);
    const result = helpers.importUsersFromPreview(preview, actor);
    if (result.error) {
      throw new HttpError(400, result.error);
    }

    helpers.writeAuditLog({
      actor,
      actionType: "CSV_IMPORT_EXECUTED",
      entityType: "user_import",
      entityId: "csv-import",
      summary: `${result.importedCount} Nutzer per CSV importiert.`,
      metadata: {
        importedCount: result.importedCount,
        skippedCount: result.skippedCount,
        generatedCredentials: result.generatedCredentials.length
      }
    });

    return result;
  }

  function updateUser(actor, userId, payload) {
    const data = validateAdminUserPayload(payload, { requirePassword: false });
    const existingUser = adminRepository.findUserForUpdate(userId);
    if (!existingUser) {
      throw new HttpError(404, "Benutzer nicht gefunden.");
    }

    const validTrainerIds = data.trainerIds.filter((trainerId) => trainerId !== userId);
    const matchingTrainerCount = adminRepository.countMatchingTrainers(validTrainerIds);
    if (matchingTrainerCount !== validTrainerIds.length) {
      throw new HttpError(400, "Mindestens ein ausgewaehlter Ausbilder wurde nicht gefunden.");
    }
    if (data.role === "trainer" && validTrainerIds.length) {
      throw new HttpError(400, "Ungueltige Nutzerdaten.");
    }

    try {
      const previousTrainerIds = existingUser.role === "trainee"
        ? adminRepository.getTrainerIdsForTrainee(userId)
        : [];

      adminRepository.updateUser(userId, {
        ...data,
        passwordHash: data.password ? helpers.hashPassword(data.password) : null
      });

      adminRepository.saveEducation(data.ausbildung);

      if (data.role === "trainee") {
        adminRepository.syncTraineeTrainerAssignments(userId, validTrainerIds);
      } else {
        adminRepository.deleteAssignmentsForTrainee(userId);
      }

      if (data.role !== "trainer") {
        adminRepository.deleteAssignmentsForTrainer(userId);
      }

      const updatedUser = {
        ...existingUser,
        name: data.name,
        username: data.username,
        email: data.email,
        role: data.role,
        ausbildung: data.ausbildung,
        betrieb: data.betrieb,
        berufsschule: data.berufsschule
      };

      const changes = helpers.computeChangedFields(existingUser, updatedUser, ["name", "username", "email", "role", "ausbildung", "betrieb", "berufsschule"]);
      helpers.writeAuditLog({
        actor,
        actionType: "USER_UPDATED",
        entityType: "user",
        entityId: String(userId),
        targetUserId: userId,
        summary: `${data.name} wurde aktualisiert: ${helpers.summarizeFieldLabels(changes, {
          name: "Name",
          username: "Benutzername",
          email: "E-Mail",
          role: "Rolle",
          ausbildung: "Ausbildung",
          betrieb: "Betrieb",
          berufsschule: "Berufsschule"
        })}`,
        changes
      });

      if (existingUser.role !== data.role) {
        helpers.writeAuditLog({
          actor,
          actionType: "ROLE_CHANGED",
          entityType: "user",
          entityId: String(userId),
          targetUserId: userId,
          summary: `${data.name} Rolle geaendert: ${existingUser.role} -> ${data.role}.`,
          changes: {
            role: {
              before: existingUser.role,
              after: data.role
            }
          }
        });
      }

      helpers.logTrainerAssignmentChanges({
        actor,
        traineeId: userId,
        traineeName: data.name,
        beforeTrainerIds: previousTrainerIds,
        afterTrainerIds: data.role === "trainee" ? validTrainerIds : []
      });

      return { ok: true };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(400, "Benutzer konnte nicht aktualisiert werden. Benutzername oder E-Mail existiert bereits.");
    }
  }

  function deleteUser(actor, userId) {
    const result = adminRepository.deleteUserCascade(actor, userId);
    if (result?.error) {
      throw new HttpError(result.status || 400, result.error);
    }
    return result;
  }

  function exportUsersCsv(res) {
    const csv = helpers.buildAdminUsersCsv(adminRepository.listUsersWithRelations());
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="verwaltung-benutzer.csv"');
    res.send(csv);
  }

  function listAuditLogs(query) {
    const userId = Number(query.userId);
    return adminRepository.listAuditLogs({
      page: query.page,
      pageSize: query.pageSize,
      actionType: String(query.actionType || "").trim(),
      userId: Number.isInteger(userId) ? userId : null,
      search: String(query.search || "").trim(),
      from: String(query.from || "").trim(),
      to: String(query.to || "").trim()
    });
  }

  function updateProfile(actor, userId, payload) {
    const trainee = adminRepository.findTraineeById(userId);
    if (!trainee || trainee.role !== "trainee") {
      throw new HttpError(404, "Azubi nicht gefunden.");
    }

    if (actor.role === "trainer" && !adminRepository.isTrainerAssignedToTrainee(actor.id, trainee.id)) {
      throw new HttpError(403, "Profil gehoert nicht zu dir.");
    }

    const profile = validateProfilePayload(payload);
    const beforeProfile = adminRepository.findTraineeProfile(userId);
    adminRepository.updateProfile(userId, profile);
    adminRepository.saveEducation(profile.ausbildung);

    if (actor.role === "admin") {
      const afterProfile = { ...beforeProfile, ...profile };
      const changes = helpers.computeChangedFields(beforeProfile, afterProfile, ["name", "ausbildung", "betrieb", "berufsschule"]);
      helpers.writeAuditLog({
        actor,
        actionType: "PROFILE_UPDATED_BY_ADMIN",
        entityType: "user",
        entityId: String(userId),
        targetUserId: userId,
        summary: `${afterProfile.name} wurde im Profil aktualisiert: ${helpers.summarizeFieldLabels(changes, {
          name: "Name",
          ausbildung: "Ausbildung",
          betrieb: "Betrieb",
          berufsschule: "Berufsschule"
        })}`,
        changes,
        metadata: {
          username: afterProfile.username,
          role: afterProfile.role
        }
      });
    }

    return { ok: true };
  }

  function getAdminDashboard() {
    return {
      role: "admin",
      users: adminRepository.listUsersWithRelations(),
      educations: adminRepository.listEducations()
    };
  }

  return {
    createUser,
    assignTrainer,
    previewImport,
    importUsers,
    updateUser,
    deleteUser,
    exportUsersCsv,
    listAuditLogs,
    updateProfile,
    getAdminDashboard
  };
}

module.exports = {
  createAdminService
};
