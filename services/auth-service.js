const bcrypt = require("bcryptjs");
const { HttpError } = require("../utils/http-error");

function createAuthService({ authRepository, helpers }) {
  function saveSession(req) {
    return new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async function login(payload, req) {
    if (helpers.isLoginRateLimited(req)) {
      throw new HttpError(429, "Zu viele Login-Versuche. Bitte spaeter erneut versuchen.");
    }

    const identifier = String(payload.identifier || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const user = await authRepository.findUserByIdentifier(identifier);
    const passwordMatches = user ? bcrypt.compareSync(password, user.password_hash) : false;

    if (!user || !passwordMatches) {
      helpers.recordLoginFailure(req);
      throw new HttpError(401, "E-Mail oder Passwort ist falsch.");
    }

    helpers.clearLoginFailures(req);
    req.session.userId = user.id;
    await saveSession(req);

    const { theme_preference, password_hash, ...safeUser } = user;
    return {
      ok: true,
      user: {
        ...safeUser,
        themePreference: helpers.normalizeThemePreference(theme_preference)
      }
    };
  }

  async function restoreSession(req) {
    return {
      user: await authRepository.getSessionUser(req)
    };
  }

  function logout(req) {
    return new Promise((resolve) => {
      req.session.destroy(() => {
        resolve({ ok: true });
      });
    });
  }

  async function updateThemePreference(userId, payload) {
    return {
      ok: true,
      themePreference: await authRepository.updateThemePreference(userId, payload.themePreference)
    };
  }

  function resolveOwnPasswordTarget(req) {
    const requestedIds = [req.params?.userId, req.body?.userId, req.body?.targetUserId]
      .filter((value) => value !== undefined && value !== null && String(value).trim() !== "");

    for (const requestedId of requestedIds) {
      const normalizedId = Number(requestedId);
      if (!Number.isInteger(normalizedId) || normalizedId !== req.user.id) {
        throw new HttpError(403, "Keine Berechtigung.");
      }
    }

    return req.user.id;
  }

  async function changeOwnPassword(req, payload) {
    const userId = resolveOwnPasswordTarget(req);
    const currentUser = await authRepository.findPasswordUserById(userId);
    if (!currentUser) {
      throw new HttpError(404, "Benutzer nicht gefunden.");
    }

    if (!bcrypt.compareSync(payload.currentPassword, currentUser.password_hash)) {
      throw new HttpError(400, "Aktuelles Passwort ist nicht korrekt.");
    }

    await authRepository.updatePasswordHash(currentUser.id, helpers.hashPassword(payload.newPassword));
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
