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

function createAdminController({ adminService, schemas }) {
  return {
    createUser(req, res) {
      const payload = parseSchema(schemas.adminUserPayloadSchema, req.body || {});
      res.json(adminService.createUser(req.user, payload));
    },

    assignTrainer(req, res) {
      const payload = parseSchema(schemas.assignTrainerSchema, req.body || {});
      res.json(adminService.assignTrainer(req.user, payload));
    },

    previewImport(req, res) {
      res.json(adminService.previewImport(req.body || {}));
    },

    importUsers(req, res) {
      res.json(adminService.importUsers(req.user, req.body || {}));
    },

    updateUser(req, res) {
      const payload = parseSchema(schemas.adminUserPayloadSchema, req.body || {});
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId)) {
        throw new HttpError(400, "Ungueltige Nutzerdaten.");
      }
      res.json(adminService.updateUser(req.user, userId, payload));
    },

    deleteUser(req, res) {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId)) {
        throw new HttpError(400, "Ungueltiger Benutzer.");
      }
      res.json(adminService.deleteUser(req.user, userId));
    },

    exportUsersCsv(_req, res) {
      adminService.exportUsersCsv(res);
    },

    listAuditLogs(req, res) {
      const query = parseSchema(schemas.auditLogQuerySchema, req.query || {});
      res.json(adminService.listAuditLogs(query));
    },

    updateProfile(req, res) {
      const payload = parseSchema(schemas.profilePayloadSchema, req.body || {});
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId)) {
        throw new HttpError(400, "Ungueltiger Nutzer.");
      }
      res.json(adminService.updateProfile(req.user, userId, payload));
    }
  };
}

module.exports = {
  createAdminController
};
