const bcrypt = require("bcryptjs");
const { HttpError } = require("../utils/http-error");

function createAuthService({ authRepository, helpers }) {
  function login(payload, req) {
    if (helpers.isLoginRateLimited(req)) {
      throw new HttpError(429, "Zu viele Login-Versuche. Bitte spaeter erneut versuchen.");
    }

    const identifier = String(payload.identifier || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const user = authRepository.findUserByIdentifier(identifier);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      helpers.recordLoginFailure(req);
      throw new HttpError(401, "E-Mail oder Passwort ist falsch.");
    }

    helpers.clearLoginFailures(req);
    req.session.userId = user.id;

    const { theme_preference, password_hash, ...safeUser } = user;
    return {
      ok: true,
      user: {
        ...safeUser,
        themePreference: helpers.normalizeThemePreference(theme_preference)
      }
    };
  }

  function restoreSession(req) {
    return {
      user: authRepository.getSessionUser(req)
    };
  }

  function logout(req) {
    return new Promise((resolve) => {
      req.session.destroy(() => {
        resolve({ ok: true });
      });
    });
  }

  function updateThemePreference(userId, payload) {
    return {
      ok: true,
      themePreference: authRepository.updateThemePreference(userId, payload.themePreference)
    };
  }

  function resolveOwnPasswordTarget(req) {
    const requestedIds = [
      req.params?.userId,
      req.body?.userId,
      req.body?.targetUserId
    ].filter((value) => value !== undefined && value !== null && String(value).trim() !== "");

    for (const requestedId of requestedIds) {
      const normalizedId = Number(requestedId);
      if (!Number.isInteger(normalizedId) || normalizedId !== req.user.id) {
        throw new HttpError(403, "Keine Berechtigung.");
      }
    }

    return req.user.id;
  }

  function changeOwnPassword(req, payload) {
    const userId = resolveOwnPasswordTarget(req);
    const currentUser = authRepository.findPasswordUserById(userId);
    if (!currentUser) {
      throw new HttpError(404, "Benutzer nicht gefunden.");
    }

    if (!bcrypt.compareSync(payload.currentPassword, currentUser.password_hash)) {
      throw new HttpError(400, "Aktuelles Passwort ist nicht korrekt.");
    }

    authRepository.updatePasswordHash(currentUser.id, helpers.hashPassword(payload.newPassword));
    helpers.clearLoginFailuresForKey(helpers.getClientIp(req), currentUser.username);
    return { ok: true };
  }

  return {
    login,
    restoreSession,
    logout,
    updateThemePreference,
    changeOwnPassword
  };
}

module.exports = {
  createAuthService
};
