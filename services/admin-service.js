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

  async function createUser(actor, payload) {
    const data = validateAdminUserPayload(payload, { requirePassword: true });
    const matchingTrainerCount = await adminRepository.countMatchingTrainers(data.trainerIds);
    if (matchingTrainerCount !== data.trainerIds.length) {
      throw new HttpError(400, "Mindestens ein ausgewaehlter Ausbilder wurde nicht gefunden.");
    }

    try {
      const insertResult = await adminRepository.insertUser({
        ...data,
        passwordHash: helpers.hashPassword(data.password)
      });
      const createdUserId = insertResult.id;
      await adminRepository.saveEducation(data.ausbildung);

      if (data.role === "trainee") {
        await adminRepository.syncTraineeTrainerAssignments(createdUserId, data.trainerIds);
        await helpers.logTrainerAssignmentChanges({
          actor,
          traineeId: createdUserId,
          traineeName: data.name,
          beforeTrainerIds: [],
          afterTrainerIds: data.trainerIds
        });
      }

      await helpers.writeAuditLog({
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

  async function assignTrainer(actor, payload) {
    const trainee = await adminRepository.findTraineeById(payload.traineeId);
    if (!trainee || trainee.role !== "trainee") {
      throw new HttpError(404, "Azubi nicht gefunden.");
    }

    const trainerIds = adminRepository.parseTrainerIds(payload.trainerIds);
    const matchingTrainerCount = await adminRepository.countMatchingTrainers(trainerIds);
    if (matchingTrainerCount !== trainerIds.length) {
      throw new HttpError(400, "Mindestens ein ausgewaehlter Ausbilder wurde nicht gefunden.");
    }

    const previousTrainerIds = await adminRepository.getTrainerIdsForTrainee(payload.traineeId);
    await adminRepository.syncTraineeTrainerAssignments(payload.traineeId, trainerIds);
    await helpers.logTrainerAssignmentChanges({
      actor,
      traineeId: payload.traineeId,
      traineeName: trainee?.name || "Azubi",
      beforeTrainerIds: previousTrainerIds,
      afterTrainerIds: trainerIds
    });

    return { ok: true };
  }

  async function previewImport(payload) {
    const preview = await helpers.buildUserImportPreview(payload);
    if (preview.error) {
      throw new HttpError(400, preview.error);
    }
    return preview;
  }

  async function importUsers(actor, payload) {
    const preview = await previewImport(payload);
    const result = await helpers.importUsersFromPreview(preview, actor);
    if (result.error) {
      throw new HttpError(400, result.error);
    }

    await helpers.writeAuditLog({
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

  async function updateUser(actor, userId, payload) {
    const data = validateAdminUserPayload(payload, { requirePassword: false });
    const existingUser = await adminRepository.findUserForUpdate(userId);
    if (!existingUser) {
      throw new HttpError(404, "Benutzer nicht gefunden.");
    }

    const validTrainerIds = data.trainerIds.filter((trainerId) => trainerId !== userId);
    const matchingTrainerCount = await adminRepository.countMatchingTrainers(validTrainerIds);
    if (matchingTrainerCount !== validTrainerIds.length) {
      throw new HttpError(400, "Mindestens ein ausgewaehlter Ausbilder wurde nicht gefunden.");
    }
    if (data.role === "trainer" && validTrainerIds.length) {
      throw new HttpError(400, "Ungueltige Nutzerdaten.");
    }

    try {
      const previousTrainerIds = existingUser.role === "trainee"
        ? await adminRepository.getTrainerIdsForTrainee(userId)
        : [];

      await adminRepository.updateUser(userId, {
        ...data,
        passwordHash: data.password ? helpers.hashPassword(data.password) : null
      });
      await adminRepository.saveEducation(data.ausbildung);

      if (data.role === "trainee") {
        await adminRepository.syncTraineeTrainerAssignments(userId, validTrainerIds);
      } else {
        await adminRepository.deleteAssignmentsForTrainee(userId);
      }

      if (data.role !== "trainer") {
        await adminRepository.deleteAssignmentsForTrainer(userId);
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
      await helpers.writeAuditLog({
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
        await helpers.writeAuditLog({
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

      await helpers.logTrainerAssignmentChanges({
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

  async function deleteUser(actor, userId) {
    const result = await adminRepository.deleteUserCascade(actor, userId);
    if (result?.error) {
      throw new HttpError(result.status || 400, result.error);
    }
    return result;
  }

  async function exportUsersCsv(res) {
    const csv = helpers.buildAdminUsersCsv(await adminRepository.listUsersWithRelations());
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="verwaltung-benutzer.csv"');
    res.send(csv);
  }

  async function listAuditLogs(query) {
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

  async function updateProfile(actor, userId, payload) {
    const trainee = await adminRepository.findTraineeById(userId);
    if (!trainee || trainee.role !== "trainee") {
      throw new HttpError(404, "Azubi nicht gefunden.");
    }

    if (actor.role === "trainer" && !await adminRepository.isTrainerAssignedToTrainee(actor.id, trainee.id)) {
      throw new HttpError(403, "Profil gehoert nicht zu dir.");
    }

    const profile = validateProfilePayload(payload);
    const beforeProfile = await adminRepository.findTraineeProfile(userId);
    await adminRepository.updateProfile(userId, profile);
    await adminRepository.saveEducation(profile.ausbildung);

    if (actor.role === "admin") {
      const afterProfile = { ...beforeProfile, ...profile };
      const changes = helpers.computeChangedFields(beforeProfile, afterProfile, ["name", "ausbildung", "betrieb", "berufsschule"]);
      await helpers.writeAuditLog({
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

  async function getAdminDashboard() {
    return {
      role: "admin",
      users: await adminRepository.listUsersWithRelations(),
      educations: await adminRepository.listEducations()
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
