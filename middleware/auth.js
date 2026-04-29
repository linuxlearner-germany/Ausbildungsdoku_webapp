const { HttpError } = require("../utils/http-error");

function createAuthMiddleware({ getCurrentUser }) {
  function getApiPath(req) {
    const value = String(req.originalUrl || req.url || "");
    try {
      return new URL(value, "http://localhost").pathname;
    } catch (_error) {
      return String(req.path || value).split("?")[0];
    }
  }

  function assertPasswordChangeAllowed(req, user) {
    if (!user?.passwordChangeRequired) {
      return;
    }

    const path = getApiPath(req);
    if (
      path === "/api/profile/password" ||
      /^\/api\/profile\/\d+\/password$/.test(path) ||
      path === "/api/logout" ||
      path === "/api/session"
    ) {
      return;
    }

    throw new HttpError(403, "Passwortwechsel erforderlich.", { code: "PASSWORD_CHANGE_REQUIRED" });
  }

  async function requireAuth(req, res, next) {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        throw new HttpError(401, "Nicht eingeloggt.", { code: "AUTH_REQUIRED" });
      }
      assertPasswordChangeAllowed(req, user);

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
        assertPasswordChangeAllowed(req, user);
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
