const { ZodError } = require("zod");
const { HttpError } = require("../utils/http-error");

function parseSchema(schema, payload) {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, error.issues[0]?.message || "Ungueltige Eingabedaten.");
    }
    throw error;
  }
}

function createReportController({ reportService, schemas }) {
  return {
    upsertReport(req, res) {
      const payload = parseSchema(schemas.reportUpsertSchema, req.body || {});
      res.json(reportService.upsertReport(req.user, payload));
    },

    createDraft(req, res) {
      const payload = parseSchema(schemas.entryPayloadSchema, req.body || {});
      res.json(reportService.createDraft(req.user, payload));
    },

    updateEntry(req, res) {
      const payload = parseSchema(schemas.entryPayloadSchema, req.body || {});
      res.json(reportService.updateEntry(req.user, String(req.params.entryId || ""), payload));
    },

    previewImport(req, res) {
      const payload = parseSchema(schemas.importPayloadSchema, req.body || {});
      res.json(reportService.previewImport(req.user, payload));
    },

    importReports(req, res) {
      const payload = parseSchema(schemas.importPayloadSchema, req.body || {});
      res.json(reportService.importReports(req.user, payload));
    },

    deleteDraft(req, res) {
      res.json(reportService.deleteDraftEntry(req.user, String(req.params.entryId || "")));
    },

    submitEntry(req, res) {
      const payload = parseSchema(schemas.submitReportSchema, req.body || {});
      res.json(reportService.submitEntry(req.user, payload.entryId));
    },

    submitEntries(req, res) {
      const payload = parseSchema(schemas.batchSubmitSchema, {
        entryIds: Array.isArray(req.body?.entryIds) ? req.body.entryIds.map((value) => String(value || "").trim()).filter(Boolean) : []
      });
      res.json(reportService.submitEntries(req.user, payload.entryIds));
    },

    signEntry(req, res) {
      const payload = parseSchema(schemas.trainerSignSchema, req.body || {});
      res.json(reportService.signEntry(req.user, payload.entryId, String(payload.trainerComment || "").trim()));
    },

    rejectEntry(req, res) {
      const payload = parseSchema(schemas.trainerRejectSchema, req.body || {});
      res.json(reportService.rejectEntry(req.user, payload.entryId, payload.reason));
    },

    commentEntry(req, res) {
      const payload = parseSchema(schemas.trainerCommentSchema, req.body || {});
      res.json(reportService.commentEntry(req.user, payload.entryId, payload.comment));
    },

    batchTrainerAction(req, res) {
      const payload = parseSchema(schemas.trainerBatchSchema, {
        action: req.body?.action,
        entryIds: Array.isArray(req.body?.entryIds) ? req.body.entryIds.map((value) => String(value || "").trim()).filter(Boolean) : [],
        trainerComment: req.body?.trainerComment || "",
        reason: req.body?.reason || ""
      });
      res.json(reportService.batchTrainerAction(req.user, payload));
    },

    exportPdf(req, res) {
      reportService.exportPdf(req, res);
    },

    exportOwnCsv(req, res) {
      reportService.exportOwnCsv(req, res);
    }
  };
}

module.exports = {
  createReportController
};
