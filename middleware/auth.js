function createAuthMiddleware({ getCurrentUser }) {
  function requireAuth(req, res, next) {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Nicht eingeloggt." });
    }

    req.user = user;
    next();
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      const user = getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: "Nicht eingeloggt." });
      }
      if (!roles.includes(user.role)) {
        return res.status(403).json({ error: "Keine Berechtigung." });
      }

      req.user = user;
      next();
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
