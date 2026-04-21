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

function createAuthController({ authService, schemas }) {
  return {
    async getSession(req, res) {
      res.json(await authService.restoreSession(req));
    },

    async login(req, res) {
      const payload = parseSchema(schemas.loginSchema, {
        identifier: req.body?.identifier || req.body?.email || "",
        password: req.body?.password || ""
      });
      res.json(await authService.login(payload, req));
    },

    async logout(req, res) {
      res.json(await authService.logout(req));
    },

    async updateThemePreference(req, res) {
      const payload = parseSchema(schemas.themePreferenceSchema, req.body || {});
      res.json(await authService.updateThemePreference(req.user.id, payload));
    },

    async changeOwnPassword(req, res) {
      const payload = parseSchema(schemas.passwordChangeSchema, req.body || {});
      res.json(await authService.changeOwnPassword(req, payload));
    }
  };
}

module.exports = {
  createAuthController
};
