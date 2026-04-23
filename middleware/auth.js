const { HttpError } = require("../utils/http-error");

function createAuthMiddleware({ getCurrentUser }) {
  async function requireAuth(req, res, next) {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        throw new HttpError(401, "Nicht eingeloggt.", { code: "AUTH_REQUIRED" });
      }

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireRole(...roles) {
    return async (req, res, next) => {
      try {
        const user = await getCurrentUser(req);
        if (!user) {
          throw new HttpError(401, "Nicht eingeloggt.", { code: "AUTH_REQUIRED" });
        }
        if (!roles.includes(user.role)) {
          throw new HttpError(403, "Keine Berechtigung.", { code: "FORBIDDEN" });
        }

        req.user = user;
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  return {
    requireAuth,
    requireRole
  };
}

module.exports = {
  createAuthMiddleware
};
