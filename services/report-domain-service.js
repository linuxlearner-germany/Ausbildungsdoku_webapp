function createReportDomainService({
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

  async function buildImportPreview(user, payload) {
    const parsed = parseImportRows(payload?.filename, payload?.contentBase64);
    if (parsed.error) {
      return parsed;
    }

    const rows = parsed.rows;
    const mapping = detectImportColumns(rows[0] || []);
    if (mapping.dateFrom === undefined || mapping.weekLabel === undefined) {
      return { error: "Die Importdatei braucht mindestens die Spalten 'Datum' und 'Titel'." };
    }

    const existingByDate = new Map((await sharedRepository.listEntriesForTrainee(user.id)).map((entry) => [entry.dateFrom, entry]));
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

  async function submitReportEntryForTrainee(user, entryId) {
    const entry = await reportRepository.findEntryForSubmission(user.id, entryId);
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

    const changes = await reportRepository.submitEntry(user.id, entryId);
    if (!changes) {
      return { error: "Eintrag nicht gefunden oder bereits signiert." };
    }

    await writeAuditLog({
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

  async function signReportEntryForActor(user, entryId, trainerComment = "") {
    const entry = await sharedRepository.findEntryWithOwnerById(entryId);
    if (!entry) {
      return { error: "Eintrag nicht gefunden." };
    }

    if (user.role === "trainer" && !await sharedRepository.isTrainerAssignedToTrainee(user.id, entry.trainee_id)) {
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

    await reportRepository.signEntry(entryId, user.name, trainerComment, new Date().toISOString());
    await writeAuditLog({
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
    await writeAuditLog({
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

  async function rejectReportEntryForActor(user, entryId, reason) {
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      return { error: "Ablehnungsgrund fehlt." };
    }

    const entry = await sharedRepository.findEntryWithOwnerById(entryId);
    if (!entry) {
      return { error: "Eintrag nicht gefunden." };
    }

    if (user.role === "trainer" && !await sharedRepository.isTrainerAssignedToTrainee(user.id, entry.trainee_id)) {
      return { error: "Eintrag gehört nicht zu dir." };
    }
    if (entry.status === "signed") {
      return { error: "Signierte Eintraege koennen nicht abgelehnt werden." };
    }
    if (entry.status !== "submitted") {
      return { error: "Nur eingereichte Eintraege koennen zurueckgegeben werden." };
    }

    await reportRepository.rejectSubmittedEntry(entryId, trimmedReason);
    await writeAuditLog({
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

  async function buildBatchResult(entryIds, handler) {
    const successIds = [];
    const failed = [];

    for (const entryId of entryIds) {
      const result = await handler(entryId);
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

  async function createDraftEntry(user, payload) {
    const entry = normalizeEntry(payload || {});
    if (!entry.dateFrom) {
      return { error: "Tag fehlt.", status: 400, code: "ENTRY_DATE_REQUIRED" };
    }

    const existing = await sharedRepository.findEntryByDate(user.id, entry.dateFrom);
    if (existing) {
      return { ok: true, entry: existing, created: false };
    }

    await reportRepository.createDraftEntry(user.id, {
      ...entry,
      weekLabel: entry.weekLabel || `Bericht ${entry.dateFrom}`,
      dateTo: entry.dateTo || entry.dateFrom,
      betrieb: "",
      schule: "",
      status: "draft",
      signedAt: null,
      signerName: "",
      trainerComment: "",
      rejectionReason: ""
    });

    return {
      ok: true,
      created: true,
      entry: await sharedRepository.findEntryById(user.id, entry.id)
    };
  }

  async function updateTraineeEntry(user, entryId, payload) {
    const existing = await sharedRepository.findEntryById(user.id, entryId);
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
      return { error: "Eingereichte Eintraege sind schreibgeschuetzt, bis sie zur Nachbearbeitung zurueckgegeben werden.", status: 400, code: "ENTRY_SUBMITTED_LOCKED" };
    }

    const conflictingEntry = await sharedRepository.findEntryByDate(user.id, entry.dateFrom);
    if (conflictingEntry && conflictingEntry.id !== entryId) {
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

    await reportRepository.updateEntry(user.id, {
      ...entry,
      dateTo: entry.dateTo || entry.dateFrom,
      status: nextStatus,
      signedAt: nextSignedAt,
      signerName: nextSignerName,
      trainerComment: nextTrainerComment,
      rejectionReason: nextRejectionReason
    });

    return { ok: true, entry: await sharedRepository.findEntryById(user.id, entryId) };
  }

  async function getTraineeDashboard(user) {
    return {
      userId: user.id,
      trainee: {
        name: user.name,
        ausbildung: user.ausbildung,
        betrieb: user.betrieb,
        berufsschule: user.berufsschule
      },
      entries: await sharedRepository.listEntriesForTrainee(user.id),
      grades: await sharedRepository.listGradesForTrainee(user.id)
    };
  }

  async function getTrainerDashboard(user) {
    const trainees = await sharedRepository.listTraineesForTrainer(user.id);
    const dashboard = [];

    for (const trainee of trainees) {
      dashboard.push({
        ...trainee,
        trainerIds: await sharedRepository.getTrainerIdsForTrainee(trainee.id),
        entries: await sharedRepository.listEntriesForTrainee(trainee.id)
      });
    }

    return dashboard;
  }

  async function upsertTraineeEntries(user, payload) {
    const entries = Array.isArray(payload.entries) ? payload.entries.map(normalizeEntry) : [];
    const existingEntries = await sharedRepository.getExistingEntriesMap(user.id);
    const duplicateDateError = await sharedRepository.ensureUniqueEntryDates(user.id, entries);
    if (duplicateDateError) {
      return duplicateDateError;
    }

    for (const entry of entries) {
      const existing = existingEntries.get(entry.id);
      if (!existing) {
        continue;
      }

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

    try {
      await reportRepository.upsertEntries(user.id, entries.map((entry) => ({
        ...entry,
        dateTo: entry.dateTo || entry.dateFrom,
        status: entry.status || "draft",
        signedAt: entry.signedAt || null,
        signerName: entry.signerName || "",
        trainerComment: entry.trainerComment || "",
        rejectionReason: entry.rejectionReason || ""
      })));
      return { ok: true };
    } catch (error) {
      if (String(error.message || "").toLowerCase().includes("idx_entries_trainee_date") || String(error.message || "").toLowerCase().includes("duplicate")) {
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
