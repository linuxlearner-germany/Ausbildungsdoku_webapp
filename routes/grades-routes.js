const express = require("express");
const { asyncHandler } = require("../middleware/async-handler");

function createGradesRoutes({ gradesController, requireRole }) {
  const router = express.Router();

  router.get("/grades", requireRole("trainee", "trainer", "admin"), asyncHandler(gradesController.listGrades));
  router.post("/grades", requireRole("trainee", "admin"), asyncHandler(gradesController.saveGrade));
  router.delete("/grades/:id", requireRole("trainee", "admin"), asyncHandler(gradesController.deleteGrade));
  router.get("/grades/pdf", requireRole("trainee", "trainer", "admin"), asyncHandler(gradesController.exportPdf));

  return router;
}

module.exports = {
  createGradesRoutes
};
