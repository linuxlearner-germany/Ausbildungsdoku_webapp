const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { createAuthMiddleware } = require("./middleware/auth");
const { createErrorHandler } = require("./middleware/error-handler");
const { createBootstrap } = require("./data/bootstrap");
const authSchemas = require("./validation/auth");
const reportSchemas = require("./validation/report");
const adminSchemas = require("./validation/admin");
const gradesSchemas = require("./validation/grades");
const { createAuthRepository } = require("./repositories/auth-repository");
const { createReportRepository } = require("./repositories/report-repository");
const { createAdminRepository } = require("./repositories/admin-repository");
const { createGradesRepository } = require("./repositories/grades-repository");
const { createSharedRepository } = require("./repositories/shared-repository");
const { createAuthService } = require("./services/auth-service");
const { createReportService } = require("./services/report-service");
const { createAdminService } = require("./services/admin-service");
const { createGradesService } = require("./services/grades-service");
const { createReportDomainService } = require("./services/report-domain-service");
const { createAdminDomainService } = require("./services/admin-domain-service");
const { createGradesDomainService } = require("./services/grades-domain-service");
const { createAuthController } = require("./controllers/auth-controller");
const { createReportController } = require("./controllers/report-controller");
const { createAdminController } = require("./controllers/admin-controller");
const { createGradesController } = require("./controllers/grades-controller");
const { createAuthRoutes } = require("./routes/auth-routes");
const { createReportRoutes } = require("./routes/report-routes");
const { createAdminRoutes } = require("./routes/admin-routes");
const { createGradesRoutes } = require("./routes/grades-routes");
const { createAuditHelpers, computeChangedFields: computeChangedFieldsUtil, summarizeFieldLabels: summarizeFieldLabelsUtil } = require("./utils/audit");
const {
  toIsoDateParts,
  parseImportedDate,
  normalizeImportedRole: normalizeImportedRoleUtil,
  parseTrainerUsernames: parseTrainerUsernamesUtil,
  generateImportPassword: generateImportPasswordUtil,
  parseImportRows: parseImportRowsUtil,
  detectImportColumns: detectImportColumnsUtil,
  detectUserImportColumns: detectUserImportColumnsUtil
} = require("./utils/imports");
const {
  buildAdminUsersCsv: buildAdminUsersCsvUtil,
  buildEntriesCsv: buildEntriesCsvUtil,
  renderPdf: renderPdfUtil,
  renderGradesPdf: renderGradesPdfUtil
} = require("./utils/exporters");
const { createLoginRateLimiter } = require("./utils/login-rate-limit");

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET;
const enableDemoData = process.env.ENABLE_DEMO_DATA === "true";
const trustProxy = ["1", "true", "yes"].includes(String(process.env.TRUST_PROXY || "").toLowerCase());
const sessionCookieName = String(process.env.SESSION_COOKIE_NAME || "berichtsheft.sid").trim() || "berichtsheft.sid";
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET muss in Produktion gesetzt sein.");
}

if (isProduction && enableDemoData) {
  throw new Error("ENABLE_DEMO_DATA darf in Produktion nicht aktiviert sein.");
}

if (trustProxy) {
  app.set("trust proxy", 1);
}

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const dbFile = process.env.DB_FILE ? path.resolve(process.env.DB_FILE) : path.join(dataDir, "berichtsheft.db");
const legacyFile = process.env.LEGACY_FILE ? path.resolve(process.env.LEGACY_FILE) : path.join(dataDir, "berichtsheft.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEntry(input) {
  const dateFrom = String(input.dateFrom || "").trim();
  return {
    id: String(input.id || `entry-${Date.now()}-${Math.random()}`),
    weekLabel: String(input.weekLabel || "").trim(),
    dateFrom,
    dateTo: String(input.dateTo || dateFrom).trim(),
    betrieb: String(input.betrieb || "").trim(),
    schule: String(input.schule || "").trim(),
    status: String(input.status || "draft"),
    signedAt: input.status === "signed" ? input.signedAt || new Date().toISOString() : input.signedAt || null,
    signerName: String(input.signerName || "").trim(),
    trainerComment: String(input.trainerComment || "").trim(),
    rejectionReason: String(input.rejectionReason || "").trim()
  };
}

function normalizeThemePreference(input) {
  const value = String(input || "").trim().toLowerCase();
  return ["light", "dark", "system"].includes(value) ? value : "system";
}
const bootstrap = createBootstrap({
  dataDir,
  legacyFile,
  db,
  enableDemoData,
  hashPassword,
  normalizeUsername,
  normalizeEntry,
  parseImportedDate,
  toIsoDateParts
});

bootstrap.ensureStorage();
bootstrap.run();

app.use(express.json({ limit: "15mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use("/Pictures", express.static(path.join(__dirname, "Pictures")));
app.use(
  session({
    name: sessionCookieName,
    secret: sessionSecret || "berichtsheft-dev-secret",
    resave: false,
    saveUninitialized: false,
    proxy: trustProxy,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use(express.static(path.join(__dirname, "public")));
const auditHelpers = createAuditHelpers({ db });
const { writeAuditLog, logTrainerAssignmentChanges, listAuditLogs } = auditHelpers;
const sharedRepository = createSharedRepository({ db, writeAuditLog });
const loginRateLimiter = createLoginRateLimiter({
  loginAttempts,
  loginWindowMs: LOGIN_WINDOW_MS,
  loginMaxAttempts: LOGIN_MAX_ATTEMPTS
});

const { requireAuth, requireRole } = createAuthMiddleware({
  getCurrentUser: sharedRepository.getCurrentUser
});

const authRepository = createAuthRepository({
  db,
  getCurrentUser: sharedRepository.getCurrentUser,
  normalizeThemePreference
});

const reportRepository = createReportRepository({
  db,
  listEntriesForTrainee: sharedRepository.listEntriesForTrainee,
  findEntryById: sharedRepository.findEntryById,
  findEntryWithOwnerById: sharedRepository.findEntryWithOwnerById,
  findTraineeById: sharedRepository.findTraineeById
});

const adminRepository = createAdminRepository({
  db,
  parseTrainerIds: sharedRepository.parseTrainerIds,
  saveEducation: sharedRepository.saveEducation,
  listUsersWithRelations: sharedRepository.listUsersWithRelations,
  listEducations: sharedRepository.listEducations,
  deleteUserCascade: sharedRepository.deleteUserCascade,
  listAuditLogs,
  isTrainerAssignedToTrainee: sharedRepository.isTrainerAssignedToTrainee
});

const gradesRepository = createGradesRepository({
  db,
  listGradesForTrainee: sharedRepository.listGradesForTrainee,
  findTraineeById: sharedRepository.findTraineeById,
  isTrainerAssignedToTrainee: sharedRepository.isTrainerAssignedToTrainee
});

const reportDomainService = createReportDomainService({
  db,
  reportRepository,
  sharedRepository,
  normalizeEntry,
  parseImportRows: parseImportRowsUtil,
  detectImportColumns: detectImportColumnsUtil,
  parseImportedDate,
  writeAuditLog
});

const adminDomainService = createAdminDomainService({
  db,
  adminRepository,
  sharedRepository,
  hashPassword,
  normalizeUsername,
  isValidEmail,
  writeAuditLog,
  logTrainerAssignmentChanges,
  normalizeImportedRole: normalizeImportedRoleUtil,
  parseTrainerUsernames: parseTrainerUsernamesUtil,
  generateImportPassword: generateImportPasswordUtil,
  parseImportRows: parseImportRowsUtil,
  detectUserImportColumns: detectUserImportColumnsUtil
});

const gradesDomainService = createGradesDomainService({
  db,
  gradesRepository,
  sharedRepository
});

const authService = createAuthService({
  authRepository,
  helpers: {
    isLoginRateLimited: loginRateLimiter.isLoginRateLimited,
    recordLoginFailure: loginRateLimiter.recordLoginFailure,
    clearLoginFailures: loginRateLimiter.clearLoginFailures,
    clearLoginFailuresForKey: loginRateLimiter.clearLoginFailuresForKey,
    normalizeThemePreference,
    hashPassword,
    getClientIp: loginRateLimiter.getClientIp
  }
});

const reportService = createReportService({
  reportRepository,
  helpers: {
    getFreshUser: sharedRepository.getCurrentUserById,
    getTraineeDashboard: reportDomainService.getTraineeDashboard,
    upsertTraineeEntries: reportDomainService.upsertTraineeEntries,
    createDraftEntry: reportDomainService.createDraftEntry,
    updateTraineeEntry: reportDomainService.updateTraineeEntry,
    buildImportPreview: reportDomainService.buildImportPreview,
    submitReportEntryForTrainee: reportDomainService.submitReportEntryForTrainee,
    signReportEntryForActor: reportDomainService.signReportEntryForActor,
    rejectReportEntryForActor: reportDomainService.rejectReportEntryForActor,
    buildBatchResult: reportDomainService.buildBatchResult,
    isTrainerAssignedToTrainee: sharedRepository.isTrainerAssignedToTrainee,
    writeAuditLog,
    renderPdf: (res, trainee, entries) => renderPdfUtil(res, trainee, entries, path.join(__dirname, "Pictures")),
    buildEntriesCsv: buildEntriesCsvUtil
  }
});

const adminService = createAdminService({
  adminRepository,
  helpers: {
    hashPassword,
    buildUserImportPreview: adminDomainService.buildUserImportPreview,
    importUsersFromPreview: adminDomainService.importUsersFromPreview,
    writeAuditLog,
    logTrainerAssignmentChanges,
    computeChangedFields: computeChangedFieldsUtil,
    summarizeFieldLabels: summarizeFieldLabelsUtil,
    validateAdminUserPayload: adminDomainService.validateAdminUserPayload,
    validateProfilePayload: adminDomainService.validateProfilePayload,
    buildAdminUsersCsv: buildAdminUsersCsvUtil
  }
});

const gradesService = createGradesService({
  gradesRepository,
  helpers: {
    resolveReadableGradesTrainee: gradesDomainService.resolveReadableGradesTrainee,
    resolveWritableGradesTrainee: gradesDomainService.resolveWritableGradesTrainee,
    validateGrade: gradesDomainService.validateGrade,
    writeAuditLog,
    computeChangedFields: computeChangedFieldsUtil,
    renderGradesPdf: (res, trainee, grades) => renderGradesPdfUtil(res, trainee, grades, path.join(__dirname, "Pictures"))
  }
});

const authController = createAuthController({
  authService,
  schemas: authSchemas
});

const reportController = createReportController({
  reportService,
  schemas: reportSchemas
});

const adminController = createAdminController({
  adminService,
  schemas: adminSchemas
});

const gradesController = createGradesController({
  gradesService,
  schemas: gradesSchemas
});

// Auth and report are the first modules extracted from the legacy monolith.
app.use("/api", createAuthRoutes({ authController, requireAuth }));
app.use("/api", createReportRoutes({ reportController, requireRole }));
app.use("/api", createAdminRoutes({ adminController, requireRole }));
app.use("/api", createGradesRoutes({ gradesController, requireRole }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, status: "healthy" });
});

app.get("/api/dashboard", requireAuth, (req, res) => {
  if (req.user.role === "trainee") {
    return res.json({ role: "trainee", report: reportDomainService.getTraineeDashboard(req.user) });
  }

  if (req.user.role === "trainer") {
    return res.json({ role: "trainer", trainees: reportDomainService.getTrainerDashboard(req.user) });
  }

  res.json({
    role: "admin",
    users: sharedRepository.listUsersWithRelations(),
    educations: sharedRepository.listEducations()
  });
});


app.get(/^\/(?!api(?:\/|$)|Pictures(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(createErrorHandler());

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Berichtsheft-App laeuft auf http://localhost:${port}`);
    if (enableDemoData) {
      console.log("Demo-Logins: azubi@example.com / azubi123 | trainer@example.com / trainer123 | admin@example.com / admin123");
    }
  });
}

module.exports = { app, db };
