function createAuthRepository({ db, getCurrentUser, normalizeThemePreference }) {
  return {
    async getSessionUser(req) {
      return getCurrentUser(req);
    },

    async findUserByIdentifier(identifier) {
      return db("users")
        .where({ email: identifier })
        .orWhere({ username: identifier })
        .first();
    },

    async findPasswordUserById(userId) {
      return db("users")
        .select("id", "username", "password_hash")
        .where({ id: userId })
        .first();
    },

    async updateThemePreference(userId, themePreference) {
      const normalized = normalizeThemePreference(themePreference);
      await db("users")
        .where({ id: userId })
        .update({ theme_preference: normalized });
      return normalized;
    },

    async updatePasswordHash(userId, passwordHash) {
      await db("users")
        .where({ id: userId })
        .update({ password_hash: passwordHash });
    }
  };
}

module.exports = {
  createAuthRepository
};
