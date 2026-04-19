const express = require("express");
const { asyncHandler } = require("../middleware/async-handler");

function createAdminRoutes({ adminController, requireRole }) {
  const router = express.Router();

  router.post("/profile/:userId", requireRole("trainer", "admin"), asyncHandler(adminController.updateProfile));
  router.post("/admin/users", requireRole("admin"), asyncHandler(adminController.createUser));
  router.post("/admin/assign-trainer", requireRole("admin"), asyncHandler(adminController.assignTrainer));
  router.post("/admin/users/import-preview", requireRole("admin"), asyncHandler(adminController.previewImport));
  router.post("/admin/users/import", requireRole("admin"), asyncHandler(adminController.importUsers));
  router.post("/admin/users/:id", requireRole("admin"), asyncHandler(adminController.updateUser));
  router.delete("/admin/users/:id", requireRole("admin"), asyncHandler(adminController.deleteUser));
  router.get("/admin/users/export.csv", requireRole("admin"), asyncHandler(adminController.exportUsersCsv));
  router.get("/admin/audit-logs", requireRole("admin"), asyncHandler(adminController.listAuditLogs));

  return router;
}

module.exports = {
  createAdminRoutes
};
