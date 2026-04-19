function createReportDomainService({
  db,
  reportRepository,
  sharedRepository,
  normalizeEntry,
  parseImportRows,
  detectImportColumns,
  parseImportedDate,
  writeAuditLog
}) {
  function validateEntry(entry) {
    const missing = [];
    if (!entry.weekLabel) missing.push("Titel");
    if (!entry.dateFrom) missing.push("Tag");
    if (!entry.betrieb && !entry.schule) {
      missing.push("Betrieb oder Berufsschule");
    }
    return missing;
  }

  function buildImportPreview(user, payload) {
    const parsed = parseImportRows(payload?.filename, payload?.contentBase64);
    if (parsed.error) {
      return parsed;
    }

    const rows = parsed.rows;
    const mapping = detectImportColumns(rows[0] || []);
    if (mapping.dateFrom === undefined || mapping.weekLabel === undefined) {
      return { error: "Die Importdatei braucht mindestens die Spalten 'Datum' und 'Titel'." };
    }

    const existingByDate = new Map(sharedRepository.listEntriesForTrainee(user.id).map((entry) => [entry.dateFrom, entry]));
    const seenDates = new Map();
    const previewRows = [];

    for (let index = 1; index < rows.length; index += 1) {
      const rawRow = rows[index];
      const rowNumber = index + 1;
      const dateFrom = parseImportedDate(rawRow[mapping.dateFrom]);
      const weekLabel = String(rawRow[mapping.weekLabel] || "").trim();
      const betrieb = String(mapping.betrieb !== undefined ? rawRow[mapping.betrieb] || "" : "").trim();
      const schule = String(mapping.schule !== undefined ? rawRow[mapping.schule] || "" : "").trim();
      const errors = [];
      const warnings = [];

      if (!dateFrom && !weekLabel && !betrieb && !schule) {
        continue;
      }

      if (!dateFrom) errors.push("Datum fehlt oder ist ungueltig");
      if (!weekLabel) errors.push("Titel fehlt");
      if (!betrieb && !schule) errors.push("Betrieb oder Berufsschule muss befuellt sein");

      if (dateFrom && seenDates.has(dateFrom)) {
        errors.push(`Doppelter Tag in Importdatei (Zeile ${seenDates.get(dateFrom)})`);
      } else if (dateFrom) {
        seenDates.set(dateFrom, rowNumber);
      }

      if (dateFrom && existingByDate.has(dateFrom)) {
        warnings.push("Fuer diesen Tag existiert bereits ein Bericht und die Zeile wird beim Import uebersprungen");
      }

      previewRows.push({
        rowNumber,
        weekLabel,
        dateFrom,
        betrieb,
        schule,
        status: "submitted",
        errors,
        warnings,
        canImport: !errors.length && !existingByDate.has(dateFrom)
      });
    }

    const validRows = previewRows.filter((row) => row.canImport);
    const invalidRows = previewRows.filter((row) => !row.canImport);

    return {
      ok: true,
      mapping,
      summary: {
        totalRows: previewRows.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length
      },
      rows: previewRows
    };
  }

  function submitReportEntryForTrainee(user, entryId) {
    const entry = db.prepare(`
      SELECT id, weekLabel, dateFrom, dateTo, betrieb, schule, status
      FROM entries
      WHERE id = ? AND trainee_id = ?
    `).get(entryId, user.id);

    if (!entry) {
      return { error: "Eintrag nicht gefunden." };
    }

    const missing = validateEntry(entry);
    if (missing.length) {
      return { error: `Pflichtfelder fehlen: ${missing.join(", ")}` };
    }

    if (entry.status === "submitted") {
      return { error: "Eintrag ist bereits eingereicht." };
    }

    if (entry.status === "signed") {
      return { error: "Signierte Einträge koennen nicht erneut eingereicht werden." };
    }

    const result = db.prepare(`
      UPDATE entries
      SET status = 'submitted', rejectionReason = '', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND trainee_id = ? AND status != 'signed'
    `).run(entryId, user.id);

    if (!result.changes) {
      return { error: "Eintrag nicht gefunden oder bereits signiert." };
    }

    writeAuditLog({
      actor: user,
      actionType: "REPORT_SUBMITTED",
      entityType: "report_entry",
      entityId: entryId,
      targetUserId: user.id,
      summary: `${entry.weekLabel || "Bericht"} wurde eingereicht.`,
      metadata: {
        dateFrom: entry.dateFrom,
        dateTo: entry.dateTo,
        statusBefore: entry.status
      }
    });

    return { ok: true, entry };
  }

  function signReportEntryForActor(user, entryId, trainerComment = "") {
    const entry = sharedRepository.findEntryWithOwnerById(entryId);

    if (!entry) {
      return { error: "Eintrag nicht gefunden." };
    }

    if (user.role === "trainer" && !sharedRepository.isTrainerAssignedToTrainee(user.id, entry.trainee_id)) {
      return { error: "Eintrag gehört nicht zu dir." };
    }

    const missing = validateEntry(entry);
    if (missing.length) {
      return { error: `Eintrag ist unvollstaendig: ${missing.join(", ")}` };
    }

    if (entry.status === "signed") {
      return { error: "Eintrag ist bereits signiert." };
    }

    if (entry.status !== "submitted") {
      return { error: "Nur eingereichte Eintraege koennen signiert werden." };
    }

    db.prepare(`
      UPDATE entries
      SET status = 'signed', signedAt = ?, signerName = ?, trainerComment = ?, rejectionReason = '', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'submitted'
    `).run(new Date().toISOString(), user.name, trainerComment, entryId);

    writeAuditLog({
      actor: user,
      actionType: "REPORT_APPROVED",
      entityType: "report_entry",
      entityId: entryId,
      targetUserId: entry.trainee_id,
      summary: `${entry.weekLabel || "Bericht"} wurde freigegeben.`,
      metadata: {
        dateFrom: entry.dateFrom,
        dateTo: entry.dateTo,
        trainerComment
      }
    });
    writeAuditLog({
      actor: user,
      actionType: "REPORT_SIGNED",
      entityType: "report_entry",
      entityId: entryId,
      targetUserId: entry.trainee_id,
      summary: `${entry.weekLabel || "Bericht"} wurde signiert.`,
      metadata: {
        dateFrom: entry.dateFrom,
        dateTo: entry.dateTo
      }
    });

    return { ok: true, entry };
  }

  function rejectReportEntryForActor(user, entryId, reason) {
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      return { error: "Ablehnungsgrund fehlt." };
    }

    const entry = sharedRepository.findEntryWithOwnerById(entryId);
    if (!entry) {
      return { error: "Eintrag nicht gefunden." };
    }

    if (user.role === "trainer" && !sharedRepository.isTrainerAssignedToTrainee(user.id, entry.trainee_id)) {
      return { error: "Eintrag gehört nicht zu dir." };
    }

    if (entry.status === "signed") {
      return { error: "Signierte Eintraege koennen nicht abgelehnt werden." };
    }

    if (entry.status !== "submitted") {
      return { error: "Nur eingereichte Eintraege koennen zurueckgegeben werden." };
    }

    db.prepare(`
      UPDATE entries
      SET status = 'rejected', signedAt = NULL, signerName = '', trainerComment = ?, rejectionReason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'submitted'
    `).run(trimmedReason, trimmedReason, entryId);

    writeAuditLog({
      actor: user,
      actionType: "REPORT_RETURNED",
      entityType: "report_entry",
      entityId: entryId,
      targetUserId: entry.trainee_id,
      summary: "Bericht wurde abgelehnt und zurueckgegeben.",
      metadata: {
        reason: trimmedReason
      }
    });

    return { ok: true, entry };
  }

  function buildBatchResult(entryIds, handler) {
    const successIds = [];
    const failed = [];

    for (const entryId of entryIds) {
      const result = handler(entryId);
      if (result?.error) {
        failed.push({ entryId, error: result.error });
        continue;
      }
      successIds.push(entryId);
    }

    return {
      processedCount: successIds.length,
      failed,
      successIds
    };
  }

  function createDraftEntry(user, payload) {
    const entry = normalizeEntry(payload || {});
    if (!entry.dateFrom) {
      return { error: "Tag fehlt.", status: 400, code: "ENTRY_DATE_REQUIRED" };
    }

    const existing = sharedRepository.findEntryByDate(user.id, entry.dateFrom);
    if (existing) {
      return { ok: true, entry: existing, created: false };
    }

    const insertEntry = db.prepare(`
      INSERT INTO entries (
        id, trainee_id, weekLabel, dateFrom, dateTo, betrieb, schule, themen, reflection,
        status, signedAt, signerName, trainerComment, rejectionReason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 'draft', NULL, '', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const entryId = entry.id || `entry-${Date.now()}-${Math.random()}`;
    insertEntry.run(
      entryId,
      user.id,
      entry.weekLabel || `Bericht ${entry.dateFrom}`,
      entry.dateFrom,
      entry.dateTo || entry.dateFrom,
      "",
      ""
    );

    return {
      ok: true,
      created: true,
      entry: sharedRepository.findEntryById(user.id, entryId)
    };
  }

  function updateTraineeEntry(user, entryId, payload) {
    const existing = sharedRepository.findEntryById(user.id, entryId);
    if (!existing) {
      return { error: "Eintrag nicht gefunden.", status: 404, code: "ENTRY_NOT_FOUND" };
    }

    const entry = normalizeEntry({ ...existing, ...(payload || {}), id: entryId });
    const contentChanged =
      entry.weekLabel !== existing.weekLabel ||
      entry.dateFrom !== existing.dateFrom ||
      entry.dateTo !== existing.dateTo ||
      entry.betrieb !== existing.betrieb ||
      entry.schule !== existing.schule;

    if (existing.status === "signed" && contentChanged) {
      return { error: "Signierte Eintraege koennen nicht bearbeitet oder geloescht werden.", status: 400, code: "ENTRY_SIGNED_LOCKED" };
    }

    if (existing.status === "submitted" && contentChanged) {
      return {
        error: "Eingereichte Eintraege sind schreibgeschuetzt, bis sie zur Nachbearbeitung zurueckgegeben werden.",
        status: 400,
        code: "ENTRY_SUBMITTED_LOCKED"
      };
    }

    const conflictingEntry = db.prepare(`
      SELECT id
      FROM entries
      WHERE trainee_id = ? AND dateFrom = ? AND id != ?
      LIMIT 1
    `).get(user.id, entry.dateFrom, entryId);
    if (conflictingEntry) {
      return { error: `Fuer ${entry.dateFrom} existiert bereits ein Tagesbericht.`, status: 400, code: "ENTRY_DATE_CONFLICT" };
    }

    let nextStatus = existing.status;
    let nextSignedAt = existing.signedAt;
    let nextSignerName = existing.signerName;
    let nextTrainerComment = existing.trainerComment;
    let nextRejectionReason = existing.rejectionReason;

    if (contentChanged && existing.status === "rejected") {
      nextStatus = "draft";
      nextSignedAt = null;
      nextSignerName = "";
      nextTrainerComment = "";
      nextRejectionReason = "";
    }

    db.prepare(`
      UPDATE entries
      SET weekLabel = ?, dateFrom = ?, dateTo = ?, betrieb = ?, schule = ?, status = ?, signedAt = ?, signerName = ?, trainerComment = ?, rejectionReason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND trainee_id = ?
    `).run(
      entry.weekLabel,
      entry.dateFrom,
      entry.dateTo || entry.dateFrom,
      entry.betrieb,
      entry.schule,
      nextStatus,
      nextSignedAt,
      nextSignerName,
      nextTrainerComment,
      nextRejectionReason,
      entryId,
      user.id
    );

    return { ok: true, entry: sharedRepository.findEntryById(user.id, entryId) };
  }

  function getTraineeDashboard(user) {
    return {
      userId: user.id,
      trainee: {
        name: user.name,
        ausbildung: user.ausbildung,
        betrieb: user.betrieb,
        berufsschule: user.berufsschule
      },
      entries: sharedRepository.listEntriesForTrainee(user.id),
      grades: sharedRepository.listGradesForTrainee(user.id)
    };
  }

  function getTrainerDashboard(user) {
    const trainees = sharedRepository.listTraineesForTrainer(user.id);

    return trainees.map((trainee) => ({
      ...trainee,
      trainerIds: sharedRepository.getTrainerIdsForTrainee(trainee.id),
      entries: sharedRepository.listEntriesForTrainee(trainee.id)
    }));
  }

  function upsertTraineeEntries(user, payload) {
    const entries = Array.isArray(payload.entries) ? payload.entries.map(normalizeEntry) : [];
    const existingEntries = sharedRepository.getExistingEntriesMap(user.id);
    const duplicateDateError = sharedRepository.ensureUniqueEntryDates(user.id, entries);
    if (duplicateDateError) {
      return duplicateDateError;
    }

    for (const entry of entries) {
      const existing = existingEntries.get(entry.id);
      if (existing) {
        const contentChanged =
          entry.weekLabel !== existing.weekLabel ||
          entry.dateFrom !== existing.dateFrom ||
          entry.dateTo !== existing.dateTo ||
          entry.betrieb !== existing.betrieb ||
          entry.schule !== existing.schule;

        entry.status = existing.status;
        entry.signedAt = existing.signedAt;
        entry.signerName = existing.signerName;
        entry.trainerComment = existing.trainerComment;
        entry.rejectionReason = existing.rejectionReason;

        if (existing.status === "signed" && contentChanged) {
          return { error: "Signierte Eintraege koennen nicht bearbeitet oder geloescht werden.", code: "ENTRY_SIGNED_LOCKED", status: 400 };
        }

        if (existing.status === "submitted" && contentChanged) {
          return { error: "Eingereichte Eintraege sind schreibgeschuetzt, bis sie zur Nachbearbeitung zurueckgegeben werden.", code: "ENTRY_SUBMITTED_LOCKED", status: 400 };
        }

        if (contentChanged && existing.status === "rejected") {
          entry.status = "draft";
          entry.signedAt = null;
          entry.signerName = "";
          entry.trainerComment = "";
          entry.rejectionReason = "";
        }
      }
    }

    const transaction = db.transaction(() => {
      const updateEntry = db.prepare(`
        UPDATE entries
        SET weekLabel = ?, dateFrom = ?, dateTo = ?, betrieb = ?, schule = ?, status = ?, signedAt = ?, signerName = ?, trainerComment = ?, rejectionReason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND trainee_id = ? AND status != 'signed'
      `);
      const insertEntry = db.prepare(`
        INSERT INTO entries (
          id, trainee_id, weekLabel, dateFrom, dateTo, betrieb, schule, themen, reflection,
          status, signedAt, signerName, trainerComment, rejectionReason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      for (const entry of entries) {
        const existing = existingEntries.get(entry.id);
        if (existing) {
          updateEntry.run(
            entry.weekLabel,
            entry.dateFrom,
            entry.dateTo,
            entry.betrieb,
            entry.schule,
            entry.status,
            entry.signedAt,
            entry.signerName,
            entry.trainerComment,
            entry.rejectionReason,
            entry.id,
            user.id
          );
          continue;
        }

        insertEntry.run(
          entry.id,
          user.id,
          entry.weekLabel,
          entry.dateFrom,
          entry.dateTo,
          entry.betrieb,
          entry.schule,
          "",
          "",
          "draft",
          null,
          "",
          "",
          ""
        );
      }
    });

    try {
      transaction();
      return { ok: true };
    } catch (error) {
      if (String(error.message || "").includes("idx_entries_trainee_date") || String(error.message || "").includes("UNIQUE constraint failed")) {
        return { error: "Pro Tag ist nur ein Tagesbericht erlaubt." };
      }
      throw error;
    }
  }

  return {
    buildImportPreview,
    submitReportEntryForTrainee,
    signReportEntryForActor,
    rejectReportEntryForActor,
    buildBatchResult,
    createDraftEntry,
    updateTraineeEntry,
    getTraineeDashboard,
    getTrainerDashboard,
    upsertTraineeEntries
  };
}

module.exports = {
  createReportDomainService
};
