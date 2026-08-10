const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { HttpError } = require("../utils/http-error");

function createAuthService({ authRepository, helpers, config, mailer, logger }) {
  function regenerateSession(req) {
    return new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

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
    const rateLimit = await helpers.getLoginRateLimit(req);
    if (rateLimit.limited) {
      throw new HttpError(429, `Zu viele Login-Versuche. Bitte in ${rateLimit.retryAfterSeconds} Sekunden erneut versuchen.`, {
        code: "RATE_LIMITED",
        details: {
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          maxAttempts: rateLimit.maxAttempts
        }
      });
    }

    const identifier = String(payload.identifier || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const user = await authRepository.findUserByIdentifier(identifier);
    const passwordMatches = user ? bcrypt.compareSync(password, user.password_hash) : false;

    if (!user || !passwordMatches) {
      await helpers.recordLoginFailure(req);
      throw new HttpError(401, "E-Mail oder Passwort ist falsch.", { code: "INVALID_CREDENTIALS" });
    }

    await helpers.clearLoginFailures(req);
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    const { theme_preference, password_hash, password_change_required, ...safeUser } = user;
    return {
      ok: true,
      user: {
        ...safeUser,
        themePreference: helpers.normalizeThemePreference(theme_preference),
        passwordChangeRequired: Boolean(password_change_required)
      }
    };
  }

  async function restoreSession(req) {
    return {
      user: await authRepository.getSessionUser(req)
    };
  }

  function clearSessionCookie(req, res) {
    const cookieOptions = req.session?.cookie || {};
    res.clearCookie(helpers.sessionCookieName || "berichtsheft.sid", {
      path: cookieOptions.path || "/",
      ...(cookieOptions.domain ? { domain: cookieOptions.domain } : {}),
      sameSite: cookieOptions.sameSite || "lax",
      secure: Boolean(cookieOptions.secure)
    });
  }

  function logout(req, res) {
    return new Promise((resolve) => {
      req.session.destroy(() => {
        clearSessionCookie(req, res);
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
    await helpers.clearLoginFailuresForKey(helpers.getClientIp(req), currentUser.username);
    return { ok: true };
  }

  async function requestPasswordReset(payload, req) {
    const mailerConfigured = typeof mailer.isConfigured === "function" ? await mailer.isConfigured() : Boolean(mailer.isConfigured);
    if (!mailerConfigured) {
      throw new HttpError(503, "Passwort-Reset ist derzeit nicht eingerichtet.", {
        code: "PASSWORD_RESET_UNAVAILABLE"
      });
    }

    const rateLimit = await helpers.getPasswordResetRateLimit(req);
    if (rateLimit.limited) {
      throw new HttpError(429, `Zu viele Anfragen. Bitte in ${rateLimit.retryAfterSeconds} Sekunden erneut versuchen.`, {
        code: "RATE_LIMITED",
        details: {
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          maxAttempts: rateLimit.maxAttempts
        }
      });
    }
    await helpers.recordPasswordResetRequest(req);

    const genericResult = {
      ok: true,
      message: "Wenn ein passendes Konto existiert, wurde eine E-Mail mit weiteren Schritten versendet."
    };
    const user = await authRepository.findUserByIdentifier(payload.identifier);
    if (!user) {
      return genericResult;
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + config.mail.passwordResetTtlMinutes * 60_000);
    const resetUrl = `${config.app.publicBaseUrl}/passwort-zuruecksetzen?token=${encodeURIComponent(token)}`;

    await authRepository.replacePasswordResetToken(user.id, tokenHash, expiresAt);
    try {
      const safeName = mailer.escapeHtml(user.name || user.username);
      const safeUrl = mailer.escapeHtml(resetUrl);
      await mailer.send({
        to: user.email,
        subject: "WIWEB Berichtsheft: Passwort zurücksetzen",
        text: `Hallo ${user.name || user.username},\n\nüber diesen Link kannst du dein Passwort für WIWEB Berichtsheft innerhalb von ${config.mail.passwordResetTtlMinutes} Minuten zurücksetzen:\n${resetUrl}\n\nWenn du die Anfrage nicht gestellt hast, ignoriere diese E-Mail.`,
        html: `<p>Hallo ${safeName},</p><p>über diesen Link kannst du dein Passwort für WIWEB Berichtsheft innerhalb von ${config.mail.passwordResetTtlMinutes} Minuten zurücksetzen:</p><p><a href="${safeUrl}">Passwort zurücksetzen</a></p><p>Wenn du die Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>`
      });
    } catch (error) {
      await authRepository.deletePasswordResetToken(tokenHash);
      logger.error("Passwort-Reset-E-Mail konnte nicht versendet werden.", {
        userId: user.id,
        error
      });
    }

    return genericResult;
  }

  async function resetPassword(payload, req) {
    const tokenHash = crypto.createHash("sha256").update(payload.token).digest("hex");
    const token = await authRepository.consumePasswordResetToken(
      tokenHash,
      helpers.hashPassword(payload.newPassword)
    );
    if (!token) {
      throw new HttpError(400, "Der Link ist ungültig, abgelaufen oder wurde bereits verwendet.", {
        code: "INVALID_RESET_TOKEN"
      });
    }

    await Promise.all([
      helpers.clearLoginFailuresForKey(helpers.getClientIp(req), token.username),
      helpers.clearLoginFailuresForKey(helpers.getClientIp(req), token.email)
    ]);
    return { ok: true, message: "Dein Passwort wurde geändert. Du kannst dich jetzt anmelden." };
  }

  return {
    login,
    restoreSession,
    logout,
    updateThemePreference,
    changeOwnPassword,
    requestPasswordReset,
    resetPassword
  };
}

module.exports = {
  createAuthService
};
