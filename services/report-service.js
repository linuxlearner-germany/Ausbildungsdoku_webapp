const { HttpError } = require("../utils/http-error");

function createReportService({ reportRepository, helpers }) {
  function getReportDashboard(user) {
    return helpers.getTraineeDashboard(helpers.getFreshUser(user.id));
  }

  function upsertReport(user, payload) {
    const result = helpers.upsertTraineeEntries(user, payload);
    if (result?.error) {
      throw new HttpError(result.status || 400, result.error, {
        code: result.code || "REPORT_UPDATE_FAILED"
      });
    }

    return {
      ok: true,
      data: getReportDashboard(user)
    };
  }

  function createDraft(user, payload) {
    const result = helpers.createDraftEntry(user, payload);
    if (result?.error) {
      throw new HttpError(result.status || 400, result.error, {
        code: result.code || "REPORT_CREATE_FAILED"
      });
    }

    return {
      ok: true,
      created: Boolean(result.created),
      entry: result.entry,
      data: getReportDashboard(user)
    };
  }

  function updateEntry(user, entryId, payload) {
    const result = helpers.updateTraineeEntry(user, entryId, payload);
    if (result?.error) {
      throw new HttpError(result.status || 400, result.error, {
        code: result.code || "REPORT_ENTRY_UPDATE_FAILED"
      });
    }

    return {
      ok: true,
      entry: result.entry,
      data: getReportDashboard(user)
    };
  }

  function previewImport(user, payload) {
    const preview = helpers.buildImportPreview(user, payload);
    if (preview.error) {
      throw new HttpError(400, preview.error);
    }
    return preview;
  }

  function importReports(user, payload) {
    const preview = previewImport(user, payload);
    const rowsToImport = preview.rows.filter((row) => row.canImport);
    if (!rowsToImport.length) {
      throw new HttpError(400, "Keine gueltigen Zeilen zum Import vorhanden.");
    }

    try {
      reportRepository.insertImportedSubmittedEntries(user.id, rowsToImport);
    } catch (_error) {
      throw new HttpError(400, "Import konnte nicht gespeichert werden. Bitte Vorschau erneut laden und doppelte Tage pruefen.");
    }

    return {
      ok: true,
      importedCount: rowsToImport.length,
      skippedCount: preview.rows.length - rowsToImport.length,
      entries: reportRepository.listEntriesForTrainee(user.id)
    };
  }

  function deleteDraftEntry(user, entryId) {
    const existing = reportRepository.findOwnedEntryStatus(user.id, entryId);
    if (!existing) {
      throw new HttpError(404, "Eintrag nicht gefunden.");
    }
    if (existing.status !== "draft") {
      throw new HttpError(400, "Nur Entwuerfe koennen geloescht werden.");
    }

    reportRepository.deleteDraftEntry(user.id, entryId);
    return {
      ok: true,
      entries: reportRepository.listEntriesForTrainee(user.id)
    };
  }

  function submitEntry(user, entryId) {
    const result = helpers.submitReportEntryForTrainee(user, entryId);
    if (result?.error) {
      throw new HttpError(result.error === "Eintrag nicht gefunden." ? 404 : 400, result.error);
    }

    return {
      ok: true,
      entries: reportRepository.listEntriesForTrainee(user.id)
    };
  }

  function submitEntries(user, entryIds) {
    const batch = helpers.buildBatchResult(entryIds, (entryId) => helpers.submitReportEntryForTrainee(user, entryId));
    if (!batch.processedCount) {
      throw new HttpError(400, batch.failed[0]?.error || "Keine Einträge konnten eingereicht werden.", {
        details: { failed: batch.failed }
      });
    }

    return {
      ok: batch.failed.length === 0,
      processedCount: batch.processedCount,
      failed: batch.failed,
      entries: reportRepository.listEntriesForTrainee(user.id)
    };
  }

  function signEntry(user, entryId, trainerComment) {
    const result = helpers.signReportEntryForActor(user, entryId, trainerComment);
    if (result?.error) {
      const status = result.error === "Eintrag nicht gefunden." ? 404 : result.error.includes("gehört nicht zu dir") ? 403 : 400;
      throw new HttpError(status, result.error);
    }

    return { ok: true };
  }

  function rejectEntry(user, entryId, reason) {
    const result = helpers.rejectReportEntryForActor(user, entryId, reason);
    if (result?.error) {
      const status = result.error === "Eintrag nicht gefunden." ? 404 : result.error.includes("gehört nicht zu dir") ? 403 : 400;
      throw new HttpError(status, result.error);
    }

    return { ok: true };
  }

  function commentEntry(user, entryId, comment) {
    const entry = reportRepository.findEntryWithOwnerById(entryId);
    if (!entry) {
      throw new HttpError(404, "Eintrag nicht gefunden.");
    }
    if (user.role === "trainer" && !helpers.isTrainerAssignedToTrainee(user.id, entry.trainee_id)) {
      throw new HttpError(403, "Eintrag gehoert nicht zu dir.");
    }
    if (entry.status === "signed") {
      throw new HttpError(400, "Signierte Eintraege koennen nicht kommentiert werden.");
    }

    reportRepository.rejectEntryWithComment(entryId, comment);
    helpers.writeAuditLog({
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

  function batchTrainerAction(user, payload) {
    let batch;
    if (payload.action === "sign") {
      batch = helpers.buildBatchResult(payload.entryIds, (entryId) => helpers.signReportEntryForActor(user, entryId, payload.trainerComment));
    } else {
      batch = helpers.buildBatchResult(payload.entryIds, (entryId) => helpers.rejectReportEntryForActor(user, entryId, payload.reason));
    }

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

  function exportPdf(req, res) {
    const requestedId = req.params.traineeId ? Number(req.params.traineeId) : req.user.id;
    let traineeId = requestedId;

    if (req.user.role === "trainee") {
      traineeId = req.user.id;
    }

    const trainee = reportRepository.findTraineeById(traineeId);
    if (!trainee) {
      throw new HttpError(404, "Azubi nicht gefunden.");
    }
    if (req.user.role === "trainer" && !helpers.isTrainerAssignedToTrainee(req.user.id, trainee.id)) {
      throw new HttpError(403, "Keine Berechtigung fuer dieses Berichtsheft.");
    }

    helpers.renderPdf(res, trainee, reportRepository.listEntriesForTrainee(trainee.id));
  }

  function exportOwnCsv(req, res) {
    const trainee = reportRepository.findTraineeById(req.user.id);
    if (!trainee) {
      throw new HttpError(404, "Azubi nicht gefunden.");
    }

    const csv = helpers.buildEntriesCsv(reportRepository.listEntriesForTrainee(req.user.id));
    const safeName = String(trainee.name || "azubi")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "azubi";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="berichtsheft-${safeName}.csv"`);
    res.send(csv);
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
    exportPdf,
    exportOwnCsv
  };
}

module.exports = {
  createReportService
};
