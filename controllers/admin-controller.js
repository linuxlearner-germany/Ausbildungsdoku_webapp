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
    async createUser(req, res) {
      const payload = parseSchema(schemas.adminUserPayloadSchema, req.body || {});
      res.json(await adminService.createUser(req.user, payload));
    },

    async assignTrainer(req, res) {
      const payload = parseSchema(schemas.assignTrainerSchema, req.body || {});
      res.json(await adminService.assignTrainer(req.user, payload));
    },

    async previewImport(req, res) {
      res.json(await adminService.previewImport(req.body || {}));
    },

    async importUsers(req, res) {
      res.json(await adminService.importUsers(req.user, req.body || {}));
    },

    async updateUser(req, res) {
      const payload = parseSchema(schemas.adminUserPayloadSchema, req.body || {});
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId)) {
        throw new HttpError(400, "Ungueltige Nutzerdaten.");
      }
      res.json(await adminService.updateUser(req.user, userId, payload));
    },

    async deleteUser(req, res) {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId)) {
        throw new HttpError(400, "Ungueltiger Benutzer.");
      }
      res.json(await adminService.deleteUser(req.user, userId));
    },

    async exportUsersCsv(_req, res) {
      await adminService.exportUsersCsv(res);
    },

    async listAuditLogs(req, res) {
      const query = parseSchema(schemas.auditLogQuerySchema, req.query || {});
      res.json(await adminService.listAuditLogs(query));
    },

    async updateProfile(req, res) {
      const payload = parseSchema(schemas.profilePayloadSchema, req.body || {});
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId)) {
        throw new HttpError(400, "Ungueltiger Nutzer.");
      }
      res.json(await adminService.updateProfile(req.user, userId, payload));
    }
  };
}

module.exports = {
  createAdminController
};
