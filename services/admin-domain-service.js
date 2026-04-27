function createAdminDomainService({
  db,
  adminRepository,
  sharedRepository,
  hashPassword,
  normalizeUsername,
  isValidEmail,
  writeAuditLog,
  logTrainerAssignmentChanges,
  normalizeImportedRole,
  parseTrainerUsernames,
  generateImportPassword,
  parseImportRows,
  detectUserImportColumns
}) {
  function normalizeOptionalIsoDate(value) {
    const normalized = String(value || "").trim();
    return normalized || "";
  }

  function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const [year, month, day] = String(value).split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function parseImportedTrainingDate(value) {
    if (value === undefined || value === null || value === "") {
      return { value: "", provided: false };
    }

    const parsed = adminRepository.parseImportedDate(value);
    if (!parsed) {
      return { error: "ungueltig" };
    }

    return { value: parsed, provided: true };
  }

  function validateTrainingWindow(role, ausbildungsStart, ausbildungsEnde) {
    if (role !== "trainee") {
      return { ausbildungsStart: "", ausbildungsEnde: "" };
    }

    if (ausbildungsStart && !isIsoDate(ausbildungsStart)) {
      return { error: "Ausbildungsbeginn ist ungueltig." };
    }

    if (ausbildungsEnde && !isIsoDate(ausbildungsEnde)) {
      return { error: "Ausbildungsende ist ungueltig." };
    }

    if (ausbildungsStart && ausbildungsEnde && ausbildungsStart > ausbildungsEnde) {
      return { error: "Ausbildungsbeginn darf nicht nach dem Ausbildungsende liegen." };
    }

    return { ausbildungsStart, ausbildungsEnde };
  }

  function validateProfilePayload(input) {
    const profile = {
      name: String(input?.name || "").trim(),
      ausbildung: String(input?.ausbildung || "").trim(),
      betrieb: String(input?.betrieb || "").trim(),
      berufsschule: String(input?.berufsschule || "").trim()
    };

    if (!profile.name) {
      return { error: "Name fehlt." };
    }

    return { data: profile };
  }

  function validateAdminUserPayload(input, { requirePassword = false } = {}) {
    const name = String(input?.name || "").trim();
    const username = normalizeUsername(input?.username);
    const email = String(input?.email || "").trim().toLowerCase();
    const role = String(input?.role || "").trim();
    const password = String(input?.password || "");
    const ausbildung = sharedRepository.normalizeEducationName(input?.ausbildung);
    const betrieb = String(input?.betrieb || "").trim();
    const berufsschule = String(input?.berufsschule || "").trim();
    const trainerIds = role === "trainee" ? sharedRepository.parseTrainerIds(input?.trainerIds) : [];
    const ausbildungsStart = normalizeOptionalIsoDate(input?.ausbildungsStart);
    const ausbildungsEnde = normalizeOptionalIsoDate(input?.ausbildungsEnde);

    if (!name || !username || !email || !["trainee", "trainer", "admin"].includes(role)) {
      return { error: "Ungueltige Nutzerdaten." };
    }
    if (!isValidEmail(email)) {
      return { error: "E-Mail-Adresse ist ungueltig." };
    }
    if (requirePassword && !password) {
      return { error: "Passwort fehlt." };
    }
    if (password && password.length < 10) {
      return { error: "Passwort muss mindestens 10 Zeichen lang sein." };
    }
    if (role === "trainee" && !ausbildung) {
      return { error: "Azubis benoetigen eine Ausbildung." };
    }
    // Trainer-Dashboards lesen eingereichte Berichte nur ueber trainee_trainers.
    // Ohne diese Zuordnung bleiben auch korrekt importierte "submitted"-Berichte unsichtbar.
    if (role === "trainee" && !trainerIds.length) {
      return { error: "Fuer Azubis muss mindestens ein Ausbilder zugeordnet werden." };
    }

    const trainingWindow = validateTrainingWindow(role, ausbildungsStart, ausbildungsEnde);
    if (trainingWindow.error) {
      return trainingWindow;
    }

    return {
      data: {
        name,
        username,
        email,
        role,
        password,
        ausbildung,
        betrieb,
        berufsschule,
        ausbildungsStart: trainingWindow.ausbildungsStart,
        ausbildungsEnde: trainingWindow.ausbildungsEnde,
        trainerIds
      }
    };
  }

  async function buildUserImportPreview(payload) {
    const parsed = parseImportRows(payload?.filename, payload?.contentBase64);
    if (parsed.error) {
      return parsed;
    }

    const rows = parsed.rows;
    const mapping = detectUserImportColumns(rows[0] || []);
    const requiredFields = ["name", "username", "email", "role"];
    const missingColumns = requiredFields.filter((field) => mapping[field] === undefined);
    if (missingColumns.length) {
      return { error: `Die CSV braucht mindestens diese Spalten: ${missingColumns.join(", ")}.` };
    }

    const existingUsers = await db("users").select("id", "username", "email", "role");
    const existingByUsername = new Map(existingUsers.map((user) => [normalizeUsername(user.username), user]));
    const existingByEmail = new Map(existingUsers.map((user) => [String(user.email || "").trim().toLowerCase(), user]));

    const fileRows = [];
    const usernameRows = new Map();
    const emailRows = new Map();

    for (let index = 1; index < rows.length; index += 1) {
      const rawRow = rows[index];
      const rowNumber = index + 1;
      const name = String(rawRow[mapping.name] || "").trim();
      const username = normalizeUsername(rawRow[mapping.username]);
      const email = String(rawRow[mapping.email] || "").trim().toLowerCase();
      const role = normalizeImportedRole(rawRow[mapping.role]);
      const password = String(mapping.password !== undefined ? rawRow[mapping.password] || "" : "");
      const ausbildung = sharedRepository.normalizeEducationName(mapping.ausbildung !== undefined ? rawRow[mapping.ausbildung] || "" : "");
      const betrieb = String(mapping.betrieb !== undefined ? rawRow[mapping.betrieb] || "" : "").trim();
      const berufsschule = String(mapping.berufsschule !== undefined ? rawRow[mapping.berufsschule] || "" : "").trim();
      const trainerUsernames = parseTrainerUsernames(mapping.trainerUsernames !== undefined ? rawRow[mapping.trainerUsernames] || "" : "", normalizeUsername);
      const parsedAusbildungsStart = parseImportedTrainingDate(mapping.ausbildungsStart !== undefined ? rawRow[mapping.ausbildungsStart] : "");
      const parsedAusbildungsEnde = parseImportedTrainingDate(mapping.ausbildungsEnde !== undefined ? rawRow[mapping.ausbildungsEnde] : "");
      const ausbildungsStart = parsedAusbildungsStart.value || "";
      const ausbildungsEnde = parsedAusbildungsEnde.value || "";
      const errors = [];
      const warnings = [];

      if (!name && !username && !email && !role && !password && !ausbildung && !betrieb && !berufsschule && !trainerUsernames.length && !ausbildungsStart && !ausbildungsEnde) {
        continue;
      }

      if (!name) errors.push("Name fehlt");
      if (!username) errors.push("Benutzername fehlt");
      if (!email) errors.push("E-Mail fehlt");
      if (email && !isValidEmail(email)) errors.push("E-Mail ist ungueltig");
      if (!role) errors.push("Rolle ist ungueltig");
      if (password && password.length < 10) errors.push("Passwort muss mindestens 10 Zeichen lang sein");
      if (role === "trainee" && !ausbildung) errors.push("Azubis benoetigen eine Ausbildung");
      if (role === "trainee" && !trainerUsernames.length) errors.push("Fuer Azubis muss mindestens ein Ausbilder zugeordnet werden");
      if (role !== "trainee" && trainerUsernames.length) errors.push("trainer_usernames ist nur fuer Azubis erlaubt");
      if (parsedAusbildungsStart.error) errors.push("Ausbildungsbeginn ist ungueltig");
      if (parsedAusbildungsEnde.error) errors.push("Ausbildungsende ist ungueltig");
      if (role !== "trainee" && ausbildungsStart) errors.push("ausbildungsbeginn ist nur fuer Azubis erlaubt");
      if (role !== "trainee" && ausbildungsEnde) errors.push("ausbildungsende ist nur fuer Azubis erlaubt");
      if (role === "trainee" && ausbildungsStart && ausbildungsEnde && ausbildungsStart > ausbildungsEnde) {
        errors.push("Ausbildungsbeginn darf nicht nach dem Ausbildungsende liegen");
      }

      if (usernameRows.has(username)) {
        errors.push(`Benutzername doppelt in Datei (Zeile ${usernameRows.get(username)})`);
      } else if (username) {
        usernameRows.set(username, rowNumber);
      }

      if (emailRows.has(email)) {
        errors.push(`E-Mail doppelt in Datei (Zeile ${emailRows.get(email)})`);
      } else if (email) {
        emailRows.set(email, rowNumber);
      }

      if (username && existingByUsername.has(username)) {
        errors.push("Benutzername existiert bereits");
      }
      if (email && existingByEmail.has(email)) {
        errors.push("E-Mail existiert bereits");
      }

      if (!password) {
        warnings.push("Kein Passwort angegeben: Beim Import wird ein zufaelliges Initialpasswort erzeugt.");
      }
      if (role === "trainee" && !ausbildungsStart && !ausbildungsEnde) {
        warnings.push("Kein Ausbildungszeitraum angegeben: Das Konto wird ohne Ausbildungsbeginn und Ausbildungsende importiert.");
      }

      fileRows.push({
        rowNumber,
        name,
        username,
        email,
        role,
        password,
        ausbildung,
        betrieb,
        berufsschule,
        ausbildungsStart,
        ausbildungsEnde,
        trainerUsernames,
        errors,
        warnings
      });
    }

    const trainerCandidates = new Map();
    existingUsers
      .filter((user) => user.role === "trainer")
      .forEach((user) => trainerCandidates.set(normalizeUsername(user.username), { role: user.role }));
    fileRows
      .filter((row) => row.role === "trainer")
      .forEach((row) => trainerCandidates.set(row.username, { role: row.role }));

    fileRows.forEach((row) => {
      if (row.role !== "trainee") {
        return;
      }

      row.trainerUsernames.forEach((trainerUsername) => {
        const candidate = trainerCandidates.get(trainerUsername);
        if (!candidate) {
          row.errors.push(`Ausbilder '${trainerUsername}' wurde nicht gefunden`);
        } else if (candidate.role !== "trainer") {
          row.errors.push(`'${trainerUsername}' ist kein Ausbilder`);
        }
      });
    });

    const previewRows = fileRows.map((row) => ({
      ...row,
      canImport: row.errors.length === 0
    }));

    return {
      ok: true,
      mapping,
      summary: {
        totalRows: previewRows.length,
        validRows: previewRows.filter((row) => row.canImport).length,
        invalidRows: previewRows.filter((row) => !row.canImport).length
      },
      rows: previewRows
    };
  }

  async function importUsersFromPreview(preview, actor = null) {
    const validRows = (preview?.rows || []).filter((row) => row.canImport);
    if (!validRows.length) {
      return { error: "Keine gueltigen Nutzer zum Import vorhanden." };
    }

    const createdCredentials = [];

    try {
      await db.transaction(async (trx) => {
        const createdUserIds = new Map();

        for (const row of validRows) {
          const password = row.password || generateImportPassword();
          const [created] = await trx("users").insert({
            name: row.name,
            username: row.username,
            email: row.email,
            password_hash: hashPassword(password),
            role: row.role,
            ausbildung: row.ausbildung,
            betrieb: row.betrieb,
            berufsschule: row.berufsschule,
            ausbildungs_start: row.role === "trainee" ? row.ausbildungsStart || null : null,
            ausbildungs_ende: row.role === "trainee" ? row.ausbildungsEnde || null : null,
            theme_preference: "system"
          }, ["id"]);

          const createdUserId = created.id;
          createdUserIds.set(row.username, createdUserId);
          createdCredentials.push({
            rowNumber: row.rowNumber,
            username: row.username,
            email: row.email,
            generatedPassword: row.password ? "" : password
          });

          await sharedRepository.saveEducation(row.ausbildung, trx);
          await writeAuditLog({
            actor,
            actionType: "USER_CREATED",
            entityType: "user",
            entityId: String(createdUserId),
            targetUserId: createdUserId,
            summary: `${row.name} wurde per CSV als ${row.role} angelegt.`,
            metadata: {
              source: "csv_import",
              username: row.username,
              email: row.email,
              role: row.role,
              ausbildung: row.ausbildung || "",
              ausbildungsStart: row.ausbildungsStart || "",
              ausbildungsEnde: row.ausbildungsEnde || ""
            },
            trx
          });
        }

        for (const row of validRows.filter((candidate) => candidate.role === "trainee")) {
          const traineeId = createdUserIds.get(row.username);
          const trainerIds = [];

          for (const trainerUsername of row.trainerUsernames) {
            const createdId = createdUserIds.get(trainerUsername);
            if (createdId) {
              trainerIds.push(createdId);
              continue;
            }

            const existing = await trx("users")
              .select("id")
              .where({ username: trainerUsername, role: "trainer" })
              .first();
            if (existing?.id) {
              trainerIds.push(existing.id);
            }
          }

          await adminRepository.syncTraineeTrainerAssignments(traineeId, trainerIds, trx);
          await logTrainerAssignmentChanges({
            actor,
            traineeId,
            traineeName: row.name,
            beforeTrainerIds: [],
            afterTrainerIds: trainerIds,
            trx
          });
        }
      });
    } catch (_error) {
      return { error: "Import konnte nicht abgeschlossen werden. Benutzername oder E-Mail existiert bereits." };
    }

    return {
      ok: true,
      importedCount: validRows.length,
      skippedCount: (preview?.rows || []).length - validRows.length,
      generatedCredentials: createdCredentials.filter((row) => row.generatedPassword)
    };
  }

  return {
    validateProfilePayload,
    validateAdminUserPayload,
    buildUserImportPreview,
    importUsersFromPreview
  };
}

module.exports = {
  createAdminDomainService
};
