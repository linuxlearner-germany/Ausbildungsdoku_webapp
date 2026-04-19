const express = require("express");
const { asyncHandler } = require("../middleware/async-handler");

function createReportRoutes({ reportController, requireRole }) {
  const router = express.Router();

  router.post("/report", requireRole("trainee"), asyncHandler(reportController.upsertReport));
  router.post("/report/draft", requireRole("trainee"), asyncHandler(reportController.createDraft));
  router.post("/report/entry/:entryId", requireRole("trainee"), asyncHandler(reportController.updateEntry));
  router.post("/report/import-preview", requireRole("trainee"), asyncHandler(reportController.previewImport));
  router.post("/report/import", requireRole("trainee"), asyncHandler(reportController.importReports));
  router.delete("/report/:entryId", requireRole("trainee"), asyncHandler(reportController.deleteDraft));
  router.post("/report/submit", requireRole("trainee"), asyncHandler(reportController.submitEntry));
  router.post("/report/submit-batch", requireRole("trainee"), asyncHandler(reportController.submitEntries));

  router.post("/trainer/sign", requireRole("trainer", "admin"), asyncHandler(reportController.signEntry));
  router.post("/trainer/comment", requireRole("trainer", "admin"), asyncHandler(reportController.commentEntry));
  router.post("/trainer/reject", requireRole("trainer", "admin"), asyncHandler(reportController.rejectEntry));
  router.post("/trainer/batch", requireRole("trainer", "admin"), asyncHandler(reportController.batchTrainerAction));

  router.get("/report/pdf", requireRole("trainee", "trainer", "admin"), asyncHandler(reportController.exportPdf));
  router.get("/report/pdf/:traineeId", requireRole("trainee", "trainer", "admin"), asyncHandler(reportController.exportPdf));
  router.get("/report/csv", requireRole("trainee"), asyncHandler(reportController.exportOwnCsv));

  return router;
}

module.exports = {
  createReportRoutes
};
