const path = require("path");
const reportSchemas = require("../../validation/report");
const { createReportRepository } = require("../../repositories/report-repository");
const { createReportDomainService } = require("../../services/report-domain-service");
const { createReportService } = require("../../services/report-service");
const { createReportController } = require("../../controllers/report-controller");
const { createReportRoutes } = require("../../routes/report-routes");
const { renderPdf, buildEntriesCsv } = require("../../utils/exporters");

function createReportModule({ config, db, sharedRepository, auditHelpers, helpers, imports, picturesDir }) {
  const reportRepository = createReportRepository({
    db,
    listEntriesForTrainee: sharedRepository.listEntriesForTrainee,
    findEntryById: sharedRepository.findEntryById,
    findEntryWithOwnerById: sharedRepository.findEntryWithOwnerById,
    findTraineeById: sharedRepository.findTraineeById
  });

  const reportDomainService = createReportDomainService({
    db,
    reportRepository,
    sharedRepository,
    reportingProgressToday: config.runtime.reportingProgressToday,
    normalizeEntry: helpers.normalizeEntry,
    parseImportRows: imports.parseImportRows,
    detectImportColumns: imports.detectImportColumns,
    parseImportedDate: imports.parseImportedDate,
    writeAuditLog: auditHelpers.writeAuditLog
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
      writeAuditLog: auditHelpers.writeAuditLog,
      buildEntriesCsv
    }
  });

  const reportController = createReportController({
    reportService,
    schemas: reportSchemas,
    helpers: {
      renderPdf: (res, trainee, entries) => renderPdf(res, trainee, entries, path.resolve(picturesDir))
    }
  });

  return {
    repository: reportRepository,
    domainService: reportDomainService,
    service: reportService,
    controller: reportController,
    routes: ({ requireRole }) => createReportRoutes({ reportController, requireRole })
  };
}

module.exports = {
  createReportModule
};
