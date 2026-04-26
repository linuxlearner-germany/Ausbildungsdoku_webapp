const { parseSchema } = require("../utils/parse-schema");

function sendDownload(res, { contentType, fileName, body }) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(body);
}

function createReportController({ reportService, schemas, helpers }) {
  return {
    async upsertReport(req, res) {
      const payload = parseSchema(schemas.reportUpsertSchema, req.body || {});
      res.json(await reportService.upsertReport(req.user, payload));
    },

    async createDraft(req, res) {
      const payload = parseSchema(schemas.entryPayloadSchema, req.body || {});
      res.json(await reportService.createDraft(req.user, payload));
    },

    async updateEntry(req, res) {
      const payload = parseSchema(schemas.entryPayloadSchema, req.body || {});
      res.json(await reportService.updateEntry(req.user, String(req.params.entryId || ""), payload));
    },

    async previewImport(req, res) {
      const payload = parseSchema(schemas.importPayloadSchema, req.body || {});
      res.json(await reportService.previewImport(req.user, payload));
    },

    async importReports(req, res) {
      const payload = parseSchema(schemas.importPayloadSchema, req.body || {});
      res.json(await reportService.importReports(req.user, payload));
    },

    async deleteDraft(req, res) {
      res.json(await reportService.deleteDraftEntry(req.user, String(req.params.entryId || "")));
    },

    async submitEntry(req, res) {
      const payload = parseSchema(schemas.submitReportSchema, req.body || {});
      res.json(await reportService.submitEntry(req.user, payload.entryId));
    },

    async submitEntries(req, res) {
      const payload = parseSchema(schemas.batchSubmitSchema, {
        entryIds: Array.isArray(req.body?.entryIds) ? req.body.entryIds.map((value) => String(value || "").trim()).filter(Boolean) : []
      });
      res.json(await reportService.submitEntries(req.user, payload.entryIds));
    },

    async signEntry(req, res) {
      const payload = parseSchema(schemas.trainerSignSchema, req.body || {});
      res.json(await reportService.signEntry(req.user, payload.entryId, String(payload.trainerComment || "").trim()));
    },

    async rejectEntry(req, res) {
      const payload = parseSchema(schemas.trainerRejectSchema, req.body || {});
      res.json(await reportService.rejectEntry(req.user, payload.entryId, payload.reason));
    },

    async commentEntry(req, res) {
      const payload = parseSchema(schemas.trainerCommentSchema, req.body || {});
      res.json(await reportService.commentEntry(req.user, payload.entryId, payload.comment));
    },

    async batchTrainerAction(req, res) {
      const payload = parseSchema(schemas.trainerBatchSchema, {
        action: req.body?.action,
        entryIds: Array.isArray(req.body?.entryIds) ? req.body.entryIds.map((value) => String(value || "").trim()).filter(Boolean) : [],
        trainerComment: req.body?.trainerComment || "",
        reason: req.body?.reason || ""
      });
      res.json(await reportService.batchTrainerAction(req.user, payload));
    },

    async exportPdf(req, res) {
      const pdfExport = await reportService.getPdfExport(req.user, req.params.traineeId);
      helpers.renderPdf(res, pdfExport.trainee, pdfExport.entries);
    },

    async exportOwnCsv(req, res) {
      sendDownload(res, await reportService.getOwnCsvExport(req.user));
    }
  };
}

module.exports = {
  createReportController
};
