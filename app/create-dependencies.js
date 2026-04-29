const { createAuthMiddleware } = require("../middleware/auth");
const { createSharedRepository } = require("../repositories/shared-repository");
const { createAuditHelpers } = require("../utils/audit");
const { createLoginRateLimiter } = require("../utils/login-rate-limit");
const {
  toIsoDateParts,
  parseImportedDate,
  normalizeImportedRole,
  parseTrainerUsernames,
  generateImportPassword,
  parseImportRows,
  detectImportColumns,
  detectUserImportColumns
} = require("../utils/imports");
const { createAuthModule } = require("../modules/auth/create-auth-module");
const { createReportModule } = require("../modules/report/create-report-module");
const { createAdminModule } = require("../modules/admin/create-admin-module");
const { createGradesModule } = require("../modules/grades/create-grades-module");
const { hashPassword, isValidEmail, normalizeUsername, normalizeEntry, normalizeThemePreference } = require("./runtime-helpers");

function createDependencies({ config, db, redisClient }) {
  const auditHelpers = createAuditHelpers({ db });
  const sharedRepository = createSharedRepository({ db, writeAuditLog: auditHelpers.writeAuditLog });
  const loginRateLimiter = createLoginRateLimiter({
    redisClient,
    keyPrefix: config.redis.keyPrefix,
    loginWindowMs: config.security.loginRateLimit.windowMs,
    loginMaxAttempts: config.security.loginRateLimit.maxAttempts
  });
  const authMiddleware = createAuthMiddleware({
    getCurrentUser: sharedRepository.getCurrentUser
  });

  const commonHelpers = {
    hashPassword,
    isValidEmail,
    normalizeUsername,
    normalizeEntry,
    normalizeThemePreference,
    sessionCookieName: config.session.cookieName
  };
  const importHelpers = {
    toIsoDateParts,
    parseImportedDate,
    normalizeImportedRole,
    parseTrainerUsernames,
    generateImportPassword,
    parseImportRows,
    detectImportColumns,
    detectUserImportColumns
  };

  const authModule = createAuthModule({
    db,
    sharedRepository,
    loginRateLimiter,
    helpers: commonHelpers
  });

  const reportModule = createReportModule({
    config,
    db,
    sharedRepository,
    auditHelpers,
    helpers: commonHelpers,
    imports: importHelpers,
    picturesDir: config.picturesDir
  });

  const adminModule = createAdminModule({
    db,
    sharedRepository,
    auditHelpers,
    helpers: commonHelpers,
    imports: importHelpers
  });

  const gradesModule = createGradesModule({
    db,
    sharedRepository,
    auditHelpers,
    picturesDir: config.picturesDir
  });

  const dashboardService = {
    async getDashboard(user) {
      if (user.role === "trainee") {
        return { role: "trainee", report: await reportModule.domainService.getTraineeDashboard(user) };
      }

      if (user.role === "trainer") {
        return { role: "trainer", trainees: await reportModule.domainService.getTrainerDashboard(user) };
      }

      return {
        role: "admin",
        users: await sharedRepository.listUsersWithRelations(),
        educations: await sharedRepository.listEducations()
      };
    }
  };

  return {
    auditHelpers,
    sharedRepository,
    loginRateLimiter,
    authMiddleware,
    modules: {
      auth: authModule,
      report: reportModule,
      admin: adminModule,
      grades: gradesModule
    },
    dashboardService,
    bootstrapHelpers: {
      hashPassword
    }
  };
}

module.exports = {
  createDependencies
};
