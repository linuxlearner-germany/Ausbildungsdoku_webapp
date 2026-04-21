const path = require("path");
const gradesSchemas = require("../../validation/grades");
const { createGradesRepository } = require("../../repositories/grades-repository");
const { createGradesDomainService } = require("../../services/grades-domain-service");
const { createGradesService } = require("../../services/grades-service");
const { createGradesController } = require("../../controllers/grades-controller");
const { createGradesRoutes } = require("../../routes/grades-routes");
const { computeChangedFields } = require("../../utils/audit");
const { renderGradesPdf } = require("../../utils/exporters");

function createGradesModule({ db, sharedRepository, auditHelpers, picturesDir }) {
  const gradesRepository = createGradesRepository({
    db,
    listGradesForTrainee: sharedRepository.listGradesForTrainee,
    findTraineeById: sharedRepository.findTraineeById,
    isTrainerAssignedToTrainee: sharedRepository.isTrainerAssignedToTrainee
  });

  const gradesDomainService = createGradesDomainService({
    db,
    gradesRepository,
    sharedRepository
  });

  const gradesService = createGradesService({
    gradesRepository,
    helpers: {
      resolveReadableGradesTrainee: gradesDomainService.resolveReadableGradesTrainee,
      resolveWritableGradesTrainee: gradesDomainService.resolveWritableGradesTrainee,
      validateGrade: gradesDomainService.validateGrade,
      writeAuditLog: auditHelpers.writeAuditLog,
      computeChangedFields,
      renderGradesPdf: (res, trainee, grades) => renderGradesPdf(res, trainee, grades, path.resolve(picturesDir))
    }
  });

  const gradesController = createGradesController({
    gradesService,
    schemas: gradesSchemas
  });

  return {
    repository: gradesRepository,
    domainService: gradesDomainService,
    service: gradesService,
    controller: gradesController,
    routes: ({ requireRole }) => createGradesRoutes({ gradesController, requireRole })
  };
}

module.exports = {
  createGradesModule
};
