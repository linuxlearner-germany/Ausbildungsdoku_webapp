const { HttpError } = require("../utils/http-error");
const { parseSchema } = require("../utils/parse-schema");

function createGradesController({ gradesService, schemas, helpers }) {
  return {
    async listGrades(req, res) {
      const query = parseSchema(schemas.gradesQuerySchema, req.query || {});
      res.json(await gradesService.listGrades(req.user, query));
    },

    async saveGrade(req, res) {
      const payload = parseSchema(schemas.gradePayloadSchema, req.body || {});
      res.json(await gradesService.saveGrade(req.user, payload));
    },

    async deleteGrade(req, res) {
      const gradeId = Number(req.params.id);
      if (!Number.isInteger(gradeId)) {
        throw new HttpError(400, "Ungueltige Note.");
      }
      res.json(await gradesService.deleteGrade(req.user, gradeId));
    },

    async exportPdf(req, res) {
      const query = parseSchema(schemas.gradesQuerySchema, req.query || {});
      const pdfExport = await gradesService.getPdfExport(req.user, query);
      helpers.renderGradesPdf(res, pdfExport.trainee, pdfExport.grades);
    }
  };
}

module.exports = {
  createGradesController
};
