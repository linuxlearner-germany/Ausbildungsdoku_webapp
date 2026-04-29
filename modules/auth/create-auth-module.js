const authSchemas = require("../../validation/auth");
const { createAuthRepository } = require("../../repositories/auth-repository");
const { createAuthService } = require("../../services/auth-service");
const { createAuthController } = require("../../controllers/auth-controller");
const { createAuthRoutes } = require("../../routes/auth-routes");

function createAuthModule({ db, sharedRepository, loginRateLimiter, helpers }) {
  const authRepository = createAuthRepository({
    db,
    getCurrentUser: sharedRepository.getCurrentUser,
    normalizeThemePreference: helpers.normalizeThemePreference
  });

  const authService = createAuthService({
    authRepository,
    helpers: {
      getLoginRateLimit: loginRateLimiter.getLoginRateLimit,
      recordLoginFailure: loginRateLimiter.recordLoginFailure,
      clearLoginFailures: loginRateLimiter.clearLoginFailures,
      clearLoginFailuresForKey: loginRateLimiter.clearLoginFailuresForKey,
      normalizeThemePreference: helpers.normalizeThemePreference,
      hashPassword: helpers.hashPassword,
      sessionCookieName: helpers.sessionCookieName,
      getClientIp: loginRateLimiter.getClientIp
    }
  });

  const authController = createAuthController({
    authService,
    schemas: authSchemas
  });

  return {
    repository: authRepository,
    service: authService,
    controller: authController,
    routes: ({ requireAuth }) => createAuthRoutes({ authController, requireAuth })
  };
}

module.exports = {
  createAuthModule
};
