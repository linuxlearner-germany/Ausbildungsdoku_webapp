function createAuthMiddleware({ getCurrentUser }) {
  async function requireAuth(req, res, next) {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: "Nicht eingeloggt." });
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
          return res.status(401).json({ error: "Nicht eingeloggt." });
        }
        if (!roles.includes(user.role)) {
          return res.status(403).json({ error: "Keine Berechtigung." });
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
