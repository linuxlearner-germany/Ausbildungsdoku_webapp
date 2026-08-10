function createAuthRepository({ db, getCurrentUser, normalizeThemePreference }) {
  return {
    async getSessionUser(req) {
      return getCurrentUser(req);
    },

    async findUserByIdentifier(identifier) {
      const normalizedIdentifier = String(identifier || "").trim().toLowerCase();
      if (!normalizedIdentifier) {
        return null;
      }

      return db("users")
        .whereRaw("LOWER(??) = ?", ["email", normalizedIdentifier])
        .orWhereRaw("LOWER(??) = ?", ["username", normalizedIdentifier])
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
        .update({
          password_hash: passwordHash,
          password_change_required: false
        });
    },

    async replacePasswordResetToken(userId, tokenHash, expiresAt) {
      await db.transaction(async (trx) => {
        await trx("password_reset_tokens")
          .where("expires_at", "<", new Date())
          .orWhereNotNull("used_at")
          .del();
        await trx("password_reset_tokens")
          .where({ user_id: userId })
          .whereNull("used_at")
          .del();
        await trx("password_reset_tokens").insert({
          user_id: userId,
          token_hash: tokenHash,
          expires_at: expiresAt
        });
      });
    },

    async deletePasswordResetToken(tokenHash) {
      await db("password_reset_tokens").where({ token_hash: tokenHash }).del();
    },

    async consumePasswordResetToken(tokenHash, passwordHash, now = new Date()) {
      return db.transaction(async (trx) => {
        const token = await trx("password_reset_tokens")
          .join("users", "users.id", "password_reset_tokens.user_id")
          .select(
            "password_reset_tokens.id",
            "password_reset_tokens.user_id as userId",
            "users.username",
            "users.email"
          )
          .where("password_reset_tokens.token_hash", tokenHash)
          .whereNull("password_reset_tokens.used_at")
          .where("password_reset_tokens.expires_at", ">", now)
          .first();

        if (!token) {
          return null;
        }

        await trx("users").where({ id: token.userId }).update({
          password_hash: passwordHash,
          password_change_required: false
        });
        await trx("password_reset_tokens")
          .where({ user_id: token.userId })
          .whereNull("used_at")
          .update({ used_at: now });
        return token;
      });
    }
  };
}

module.exports = {
  createAuthRepository
};
