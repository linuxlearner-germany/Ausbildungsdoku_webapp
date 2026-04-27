const adminSchemas = require("../../validation/admin");
const { createAdminRepository } = require("../../repositories/admin-repository");
const { createAdminDomainService } = require("../../services/admin-domain-service");
const { createAdminService } = require("../../services/admin-service");
const { createAdminController } = require("../../controllers/admin-controller");
const { createAdminRoutes } = require("../../routes/admin-routes");
const { computeChangedFields, summarizeFieldLabels } = require("../../utils/audit");
const { buildAdminUsersCsv } = require("../../utils/exporters");

function createAdminModule({ db, sharedRepository, auditHelpers, helpers, imports }) {
  const adminRepository = createAdminRepository({
    db,
    parseTrainerIds: sharedRepository.parseTrainerIds,
    parseImportedDate: imports.parseImportedDate,
    saveEducation: sharedRepository.saveEducation,
    listUsersWithRelations: sharedRepository.listUsersWithRelations,
    listEducations: sharedRepository.listEducations,
    deleteUserCascade: sharedRepository.deleteUserCascade,
    listAuditLogs: auditHelpers.listAuditLogs,
    isTrainerAssignedToTrainee: sharedRepository.isTrainerAssignedToTrainee
  });

  const adminDomainService = createAdminDomainService({
    db,
    adminRepository,
    sharedRepository,
    hashPassword: helpers.hashPassword,
    normalizeUsername: helpers.normalizeUsername,
    isValidEmail: helpers.isValidEmail,
    writeAuditLog: auditHelpers.writeAuditLog,
    logTrainerAssignmentChanges: auditHelpers.logTrainerAssignmentChanges,
    normalizeImportedRole: imports.normalizeImportedRole,
    parseTrainerUsernames: imports.parseTrainerUsernames,
    generateImportPassword: imports.generateImportPassword,
    parseImportRows: imports.parseImportRows,
    detectUserImportColumns: imports.detectUserImportColumns
  });

  const adminService = createAdminService({
    adminRepository,
    helpers: {
      hashPassword: helpers.hashPassword,
      buildUserImportPreview: adminDomainService.buildUserImportPreview,
      importUsersFromPreview: adminDomainService.importUsersFromPreview,
      writeAuditLog: auditHelpers.writeAuditLog,
      logTrainerAssignmentChanges: auditHelpers.logTrainerAssignmentChanges,
      computeChangedFields,
      summarizeFieldLabels,
      validateAdminUserPayload: adminDomainService.validateAdminUserPayload,
      validateProfilePayload: adminDomainService.validateProfilePayload,
      buildAdminUsersCsv
    }
  });

  const adminController = createAdminController({
    adminService,
    schemas: adminSchemas
  });

  return {
    repository: adminRepository,
    domainService: adminDomainService,
    service: adminService,
    controller: adminController,
    routes: ({ requireRole }) => createAdminRoutes({ adminController, requireRole })
  };
}

module.exports = {
  createAdminModule
};
