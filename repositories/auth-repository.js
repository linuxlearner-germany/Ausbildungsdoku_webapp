function createAuthRepository({ db, getCurrentUser, normalizeThemePreference }) {
  return {
    getSessionUser(req) {
      return getCurrentUser(req);
    },

    findUserByIdentifier(identifier) {
      return db.prepare("SELECT * FROM users WHERE email = ? OR username = ?").get(identifier, identifier);
    },

    findPasswordUserById(userId) {
      return db.prepare("SELECT id, username, password_hash FROM users WHERE id = ?").get(userId);
    },

    updateThemePreference(userId, themePreference) {
      const normalized = normalizeThemePreference(themePreference);
      db.prepare("UPDATE users SET theme_preference = ? WHERE id = ?").run(normalized, userId);
      return normalized;
    },

    updatePasswordHash(userId, passwordHash) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
    }
  };
}

module.exports = {
  createAuthRepository
};
