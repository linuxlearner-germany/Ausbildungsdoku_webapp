const { HttpError } = require("../utils/http-error");

function createAdminService({ adminRepository, helpers, mailer, encryptSetting, sessionSecret }) {
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
          ausbildung: data.ausbildung,
          ausbildungsStart: data.ausbildungsStart,
          ausbildungsEnde: data.ausbildungsEnde
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
    if (!trainerIds.length) {
      throw new HttpError(400, "Fuer Azubis muss mindestens ein Ausbilder zugeordnet werden.");
    }
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
        berufsschule: data.berufsschule,
        ausbildungsStart: data.ausbildungsStart,
        ausbildungsEnde: data.ausbildungsEnde
      };

      const changes = helpers.computeChangedFields(existingUser, updatedUser, ["name", "username", "email", "role", "ausbildung", "betrieb", "berufsschule", "ausbildungsStart", "ausbildungsEnde"]);
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
          berufsschule: "Berufsschule",
          ausbildungsStart: "Ausbildungsbeginn",
          ausbildungsEnde: "Ausbildungsende"
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

  async function getUsersCsvExport() {
    return {
      contentType: "text/csv; charset=utf-8",
      fileName: "verwaltung-benutzer.csv",
      body: helpers.buildAdminUsersCsv(await adminRepository.listUsersWithRelations())
    };
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

  function normalizeEmailRelaySettings(input, existing = null) {
    const host = String(input.host || "").trim();
    const from = String(input.from || "").trim();
    const replyTo = String(input.replyTo || "").trim();
    const username = String(input.username || "").trim();
    const password = String(input.password || "");
    const clearPassword = Boolean(input.clearPassword);
    if (input.enabled && (!host || !from)) {
      throw new HttpError(400, "SMTP-Host und Absender muessen bei aktivem Relay gesetzt sein.");
    }
    if (from && !helpers.isValidEmail(from.match(/<([^>]+)>/)?.[1] || from)) {
      throw new HttpError(400, "Die Absenderadresse ist ungueltig.");
    }
    if (replyTo && !helpers.isValidEmail(replyTo)) {
      throw new HttpError(400, "Die Reply-To-Adresse ist ungueltig.");
    }
    if (Boolean(username) !== Boolean(password || (existing?.password_encrypted && !clearPassword))) {
      throw new HttpError(400, "SMTP-Benutzername und Passwort muessen gemeinsam gesetzt sein.");
    }
    const passwordEncrypted = !username || clearPassword
      ? null
      : password
        ? encryptSetting(password, sessionSecret)
        : existing?.password_encrypted || null;
    return { enabled: Boolean(input.enabled), host, port: Number(input.port), secure: Boolean(input.secure), requireTls: Boolean(input.requireTls), username, passwordEncrypted, from, replyTo };
  }

  function serializeEmailRelaySettings(row, fallback) {
    const source = row ? "database" : "environment";
    const values = row || fallback;
    return {
      source,
      enabled: Boolean(values.enabled),
      host: values.host || "",
      port: Number(values.port || 587),
      secure: Boolean(values.secure),
      requireTls: Boolean(row ? values.require_tls : values.requireTls),
      username: values.username || values.user || "",
      passwordConfigured: Boolean(row ? values.password_encrypted : values.password),
      from: values.from_address || values.from || "",
      replyTo: values.reply_to || values.replyTo || "",
      updatedAt: row?.updated_at || null
    };
  }

  async function getEmailRelaySettings() {
    return serializeEmailRelaySettings(await adminRepository.getEmailRelaySettings(), mailer.getEnvironmentSettings());
  }

  async function saveEmailRelaySettings(actor, payload) {
    const existing = await adminRepository.getEmailRelaySettings();
    const settings = normalizeEmailRelaySettings(payload, existing);
    await adminRepository.saveEmailRelaySettings(settings, actor.id);
    await helpers.writeAuditLog({ actor, actionType: "EMAIL_RELAY_UPDATED", entityType: "email_relay", entityId: "1", summary: "E-Mail-Relay-Einstellungen aktualisiert.", metadata: { enabled: settings.enabled, host: settings.host, port: settings.port, secure: settings.secure, hasAuthentication: Boolean(settings.username) } });
    return { ok: true, settings: await getEmailRelaySettings() };
  }

  async function testEmailRelaySettings(actor, payload) {
    if (!payload.enabled) {
      throw new HttpError(400, "Aktiviere das Relay, bevor du eine Test-E-Mail sendest.", {
        code: "SMTP_RELAY_DISABLED"
      });
    }
    const saved = await saveEmailRelaySettings(actor, payload);
    try {
      await mailer.send({ to: actor.email, subject: "WIWEB Berichtsheft: E-Mail-Test", text: "Die E-Mail-Relay-Konfiguration für WIWEB Berichtsheft funktioniert.", html: "<p>Die E-Mail-Relay-Konfiguration für WIWEB Berichtsheft funktioniert.</p>" });
    } catch (error) {
      const smtpResponse = String(error?.response || error?.message || "").toLowerCase();
      if (smtpResponse.includes("relay access denied")) {
        throw new HttpError(502, "Der SMTP-Server erlaubt keine Zustellung an deine Admin-E-Mail-Adresse. Passe die Relay-Regeln des Mailservers an oder hinterlege für das Admin-Konto eine zugelassene Empfängeradresse.", {
          code: "SMTP_RELAY_DENIED"
        });
      }
      throw new HttpError(502, "Test-E-Mail konnte nicht versendet werden. Bitte Relay-Einstellungen pruefen.", { code: "SMTP_TEST_FAILED" });
    }
    await helpers.writeAuditLog({ actor, actionType: "EMAIL_RELAY_TEST_SENT", entityType: "email_relay", entityId: "1", summary: "Test-E-Mail fuer das Relay versendet." });
    return saved;
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
    getUsersCsvExport,
    listAuditLogs,
    getEmailRelaySettings,
    saveEmailRelaySettings,
    testEmailRelaySettings,
    updateProfile,
    getAdminDashboard
  };
}

module.exports = {
  createAdminService
};
