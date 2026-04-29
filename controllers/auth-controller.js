const { parseSchema } = require("../utils/parse-schema");

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
      res.json(await authService.logout(req, res));
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
