const { HttpError } = require("../utils/http-error");

function createReportService({ reportRepository, helpers }) {
  async function getReportDashboard(user) {
    return helpers.getTraineeDashboard(await helpers.getFreshUser(user.id));
  }

  async function upsertReport(user, payload) {
    const result = await helpers.upsertTraineeEntries(user, payload);
    if (result?.error) {
      throw new HttpError(result.status || 400, result.error, {
        code: result.code || "REPORT_UPDATE_FAILED"
      });
    }

    return {
      ok: true,
      data: await getReportDashboard(user)
    };
  }

  async function createDraft(user, payload) {
    const result = await helpers.createDraftEntry(user, payload);
    if (result?.error) {
      throw new HttpError(result.status || 400, result.error, {
        code: result.code || "REPORT_CREATE_FAILED"
      });
    }

    return {
      ok: true,
      created: Boolean(result.created),
      entry: result.entry,
      data: await getReportDashboard(user)
    };
  }

  async function updateEntry(user, entryId, payload) {
    const result = await helpers.updateTraineeEntry(user, entryId, payload);
    if (result?.error) {
      throw new HttpError(result.status || 400, result.error, {
        code: result.code || "REPORT_ENTRY_UPDATE_FAILED"
      });
    }

    return {
      ok: true,
      entry: result.entry,
      data: await getReportDashboard(user)
    };
  }

  async function previewImport(user, payload) {
    const preview = await helpers.buildImportPreview(user, payload);
    if (preview.error) {
      throw new HttpError(400, preview.error);
    }
    return preview;
  }

  async function importReports(user, payload) {
    const preview = await previewImport(user, payload);
    const rowsToImport = preview.rows.filter((row) => row.canImport);
    if (!rowsToImport.length) {
      throw new HttpError(400, "Keine gueltigen Zeilen zum Import vorhanden.");
    }

    try {
      await reportRepository.insertImportedSubmittedEntries(user.id, rowsToImport);
    } catch (_error) {
      throw new HttpError(400, "Import konnte nicht gespeichert werden. Bitte Vorschau erneut laden und doppelte Tage pruefen.");
    }

    return {
      ok: true,
      importedCount: rowsToImport.length,
      skippedCount: preview.rows.length - rowsToImport.length,
      entries: await reportRepository.listEntriesForTrainee(user.id)
    };
  }

  async function deleteDraftEntry(user, entryId) {
    const existing = await reportRepository.findOwnedEntryStatus(user.id, entryId);
    if (!existing) {
      throw new HttpError(404, "Eintrag nicht gefunden.");
    }
    if (existing.status !== "draft") {
      throw new HttpError(400, "Nur Entwuerfe koennen geloescht werden.");
    }

    await reportRepository.deleteDraftEntry(user.id, entryId);
    return {
      ok: true,
      entries: await reportRepository.listEntriesForTrainee(user.id)
    };
  }

  async function submitEntry(user, entryId) {
    const result = await helpers.submitReportEntryForTrainee(user, entryId);
    if (result?.error) {
      throw new HttpError(result.error === "Eintrag nicht gefunden." ? 404 : 400, result.error);
    }

    return {
      ok: true,
      entries: await reportRepository.listEntriesForTrainee(user.id)
    };
  }

  async function submitEntries(user, entryIds) {
    const batch = await helpers.buildBatchResult(entryIds, (entryId) => helpers.submitReportEntryForTrainee(user, entryId));
    if (!batch.processedCount) {
      throw new HttpError(400, batch.failed[0]?.error || "Keine Einträge konnten eingereicht werden.", {
        details: { failed: batch.failed }
      });
    }

    return {
      ok: batch.failed.length === 0,
      processedCount: batch.processedCount,
      failed: batch.failed,
      entries: await reportRepository.listEntriesForTrainee(user.id)
    };
  }

  async function signEntry(user, entryId, trainerComment) {
    const result = await helpers.signReportEntryForActor(user, entryId, trainerComment);
    if (result?.error) {
      const status = result.error === "Eintrag nicht gefunden." ? 404 : result.error.includes("gehört nicht zu dir") ? 403 : 400;
      throw new HttpError(status, result.error);
    }

    return { ok: true };
  }

  async function rejectEntry(user, entryId, reason) {
    const result = await helpers.rejectReportEntryForActor(user, entryId, reason);
    if (result?.error) {
      const status = result.error === "Eintrag nicht gefunden." ? 404 : result.error.includes("gehört nicht zu dir") ? 403 : 400;
      throw new HttpError(status, result.error);
    }

    return { ok: true };
  }

  async function commentEntry(user, entryId, comment) {
    const entry = await reportRepository.findEntryWithOwnerById(entryId);
    if (!entry) {
      throw new HttpError(404, "Eintrag nicht gefunden.");
    }
    if (user.role === "trainer" && !await helpers.isTrainerAssignedToTrainee(user.id, entry.trainee_id)) {
      throw new HttpError(403, "Eintrag gehoert nicht zu dir.");
    }
    if (entry.status === "signed") {
      throw new HttpError(400, "Signierte Eintraege koennen nicht kommentiert werden.");
    }

    await reportRepository.rejectEntryWithComment(entryId, comment);
    await helpers.writeAuditLog({
      actor: user,
      actionType: "REPORT_RETURNED",
      entityType: "report_entry",
      entityId: entryId,
      targetUserId: entry.trainee_id,
      summary: "Bericht wurde mit Kommentar zurueckgegeben.",
      metadata: { reason: comment }
    });

    return { ok: true };
  }

  async function batchTrainerAction(user, payload) {
    const batch = payload.action === "sign"
      ? await helpers.buildBatchResult(payload.entryIds, (entryId) => helpers.signReportEntryForActor(user, entryId, payload.trainerComment))
      : await helpers.buildBatchResult(payload.entryIds, (entryId) => helpers.rejectReportEntryForActor(user, entryId, payload.reason));

    if (!batch.processedCount) {
      throw new HttpError(400, batch.failed[0]?.error || "Keine Einträge konnten verarbeitet werden.", {
        details: { failed: batch.failed }
      });
    }

    return {
      ok: batch.failed.length === 0,
      processedCount: batch.processedCount,
      failed: batch.failed
    };
  }

  async function getPdfExport(user, requestedTraineeId) {
    let traineeId = requestedTraineeId ? Number(requestedTraineeId) : user.id;

    if (user.role === "trainee") {
      traineeId = user.id;
    }

    const trainee = await reportRepository.findTraineeById(traineeId);
    if (!trainee) {
      throw new HttpError(404, "Azubi nicht gefunden.");
    }
    if (user.role === "trainer" && !await helpers.isTrainerAssignedToTrainee(user.id, trainee.id)) {
      throw new HttpError(403, "Keine Berechtigung fuer dieses Berichtsheft.");
    }

    return {
      trainee,
      entries: await reportRepository.listEntriesForTrainee(trainee.id)
    };
  }

  async function getOwnCsvExport(user) {
    const trainee = await reportRepository.findTraineeById(user.id);
    if (!trainee) {
      throw new HttpError(404, "Azubi nicht gefunden.");
    }

    const csv = helpers.buildEntriesCsv(await reportRepository.listEntriesForTrainee(user.id));
    const safeName = String(trainee.name || "azubi")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "azubi";

    return {
      contentType: "text/csv; charset=utf-8",
      fileName: `berichtsheft-${safeName}.csv`,
      body: csv
    };
  }

  return {
    upsertReport,
    createDraft,
    updateEntry,
    previewImport,
    importReports,
    deleteDraftEntry,
    submitEntry,
    submitEntries,
    signEntry,
    rejectEntry,
    commentEntry,
    batchTrainerAction,
    getPdfExport,
    getOwnCsvExport
  };
}

module.exports = {
  createReportService
};
