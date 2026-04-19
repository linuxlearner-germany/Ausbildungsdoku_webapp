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

function createGradesController({ gradesService, schemas }) {
  return {
    listGrades(req, res) {
      const query = parseSchema(schemas.gradesQuerySchema, req.query || {});
      res.json(gradesService.listGrades(req.user, query));
    },

    saveGrade(req, res) {
      const payload = parseSchema(schemas.gradePayloadSchema, req.body || {});
      res.json(gradesService.saveGrade(req.user, payload));
    },

    deleteGrade(req, res) {
      const gradeId = Number(req.params.id);
      if (!Number.isInteger(gradeId)) {
        throw new HttpError(400, "Ungueltige Note.");
      }
      res.json(gradesService.deleteGrade(req.user, gradeId));
    },

    exportPdf(req, res) {
      const query = parseSchema(schemas.gradesQuerySchema, req.query || {});
      gradesService.exportPdf(req.user, query, res);
    }
  };
}

module.exports = {
  createGradesController
};
