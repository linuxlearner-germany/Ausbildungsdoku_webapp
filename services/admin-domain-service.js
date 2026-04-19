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
        trainerIds
      }
    };
  }

  function buildUserImportPreview(payload) {
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

    const existingUsers = db.prepare(`
      SELECT id, username, email, role
      FROM users
    `).all();
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
      const errors = [];
      const warnings = [];

      if (!name && !username && !email && !role && !password && !ausbildung && !betrieb && !berufsschule && !trainerUsernames.length) {
        continue;
      }

      if (!name) errors.push("Name fehlt");
      if (!username) errors.push("Benutzername fehlt");
      if (!email) errors.push("E-Mail fehlt");
      if (email && !isValidEmail(email)) errors.push("E-Mail ist ungueltig");
      if (!role) errors.push("Rolle ist ungueltig");
      if (password && password.length < 10) errors.push("Passwort muss mindestens 10 Zeichen lang sein");
      if (role === "trainee" && !ausbildung) errors.push("Azubis benoetigen eine Ausbildung");
      if (role !== "trainee" && trainerUsernames.length) errors.push("trainer_usernames ist nur fuer Azubis erlaubt");

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
        trainerUsernames,
        errors,
        warnings
      });
    }

    const trainerCandidates = new Map();
    existingUsers
      .filter((user) => user.role === "trainer")
      .forEach((user) => trainerCandidates.set(normalizeUsername(user.username), { source: "existing", role: user.role, rowNumber: null }));
    fileRows
      .filter((row) => row.role === "trainer")
      .forEach((row) => trainerCandidates.set(row.username, { source: "file", role: row.role, rowNumber: row.rowNumber }));

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

  function importUsersFromPreview(preview, actor = null) {
    const validRows = (preview?.rows || []).filter((row) => row.canImport);
    if (!validRows.length) {
      return { error: "Keine gueltigen Nutzer zum Import vorhanden." };
    }

    const createdCredentials = [];
    const transaction = db.transaction(() => {
      const createdUserIds = new Map();

      validRows.forEach((row) => {
        const password = row.password || generateImportPassword();
        const insertResult = db.prepare(`
          INSERT INTO users (name, username, email, password_hash, role, trainer_id, ausbildung, betrieb, berufsschule)
          VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
        `).run(row.name, row.username, row.email, hashPassword(password), row.role, row.ausbildung, row.betrieb, row.berufsschule);
        const createdUserId = insertResult.lastInsertRowid;

        createdUserIds.set(row.username, createdUserId);
        createdCredentials.push({
          rowNumber: row.rowNumber,
          username: row.username,
          email: row.email,
          generatedPassword: row.password ? "" : password
        });
        sharedRepository.saveEducation(row.ausbildung);

        writeAuditLog({
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
            ausbildung: row.ausbildung || ""
          }
        });
      });

      validRows
        .filter((row) => row.role === "trainee")
        .forEach((row) => {
          const traineeId = createdUserIds.get(row.username);
          const trainerIds = row.trainerUsernames
            .map((trainerUsername) => {
              const createdId = createdUserIds.get(trainerUsername);
              if (createdId) {
                return createdId;
              }
              const existing = db.prepare("SELECT id FROM users WHERE username = ? AND role = 'trainer'").get(trainerUsername);
              return existing?.id || null;
            })
            .filter((value) => Number.isInteger(value));

          adminRepository.syncTraineeTrainerAssignments(traineeId, trainerIds);
          logTrainerAssignmentChanges({
            actor,
            traineeId,
            traineeName: row.name,
            beforeTrainerIds: [],
            afterTrainerIds: trainerIds
          });
        });
    });

    try {
      transaction();
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
