const { HttpError } = require("../utils/http-error");

function createGradesService({ gradesRepository, helpers }) {
  function resolveReadableTrainee(user, requestedTraineeId) {
    const access = helpers.resolveReadableGradesTrainee(user, requestedTraineeId);
    if (access.error) {
      throw new HttpError(access.status || 400, access.error);
    }
    return access.trainee;
  }

  function resolveWritableTrainee(user, requestedTraineeId, gradeId = null) {
    const access = helpers.resolveWritableGradesTrainee(user, requestedTraineeId, gradeId);
    if (access.error) {
      throw new HttpError(access.status || 400, access.error);
    }
    return access.trainee;
  }

  function validateGrade(input) {
    const result = helpers.validateGrade(input);
    if (result.error) {
      throw new HttpError(400, result.error);
    }
    return result.data;
  }

  function listGrades(user, query) {
    const trainee = resolveReadableTrainee(user, query.traineeId);
    return {
      traineeId: trainee?.id || null,
      grades: trainee ? gradesRepository.listGradesForTrainee(trainee.id) : []
    };
  }

  function saveGrade(user, payload) {
    const grade = validateGrade(payload);
    const trainee = resolveWritableTrainee(user, payload.traineeId, grade.id);
    const traineeId = trainee.id;
    const existingGrade = grade.id ? gradesRepository.findGrade(grade.id, traineeId) : null;

    if (grade.id) {
      gradesRepository.updateGrade(traineeId, grade);
    } else {
      gradesRepository.createGrade(traineeId, grade);
    }

    const gradeRow = grade.id
      ? { ...existingGrade, ...grade }
      : gradesRepository.findLatestGradeForTrainee(traineeId);

    if (grade.id) {
      helpers.writeAuditLog({
        actor: user,
        actionType: "GRADE_UPDATED",
        entityType: "grade",
        entityId: String(grade.id),
        targetUserId: traineeId,
        summary: `Note ${grade.bezeichnung || grade.fach} wurde aktualisiert.`,
        changes: helpers.computeChangedFields(existingGrade, grade, ["fach", "typ", "bezeichnung", "datum", "note", "gewicht"])
      });
    } else {
      helpers.writeAuditLog({
        actor: user,
        actionType: "GRADE_CREATED",
        entityType: "grade",
        entityId: String(gradeRow?.id || ""),
        targetUserId: traineeId,
        summary: `Note ${grade.bezeichnung || grade.fach} wurde angelegt.`,
        metadata: {
          fach: grade.fach,
          typ: grade.typ,
          datum: grade.datum,
          note: grade.note,
          gewicht: grade.gewicht
        }
      });
    }

    return { ok: true, traineeId, grades: gradesRepository.listGradesForTrainee(traineeId) };
  }

  function deleteGrade(user, gradeId) {
    const trainee = resolveWritableTrainee(user, null, gradeId);
    const traineeId = trainee.id;
    const existingGrade = gradesRepository.findGrade(gradeId, traineeId);
    const result = gradesRepository.deleteGrade(gradeId, traineeId);
    if (!result.changes) {
      throw new HttpError(404, "Note nicht gefunden.");
    }

    helpers.writeAuditLog({
      actor: user,
      actionType: "GRADE_DELETED",
      entityType: "grade",
      entityId: String(gradeId),
      targetUserId: traineeId,
      summary: `Note ${existingGrade?.bezeichnung || existingGrade?.fach || gradeId} wurde geloescht.`,
      metadata: existingGrade
        ? {
            fach: existingGrade.fach,
            typ: existingGrade.typ,
            datum: existingGrade.datum,
            note: existingGrade.note
          }
        : null
    });

    return { ok: true, traineeId, grades: gradesRepository.listGradesForTrainee(traineeId) };
  }

  function exportPdf(user, query, res) {
    const trainee = resolveReadableTrainee(user, query.traineeId);
    if (!trainee) {
      throw new HttpError(400, "Azubi-ID fehlt.");
    }

    helpers.renderGradesPdf(res, trainee, gradesRepository.listGradesForTrainee(trainee.id));
  }

  return {
    listGrades,
    saveGrade,
    deleteGrade,
    exportPdf
  };
}

module.exports = {
  createGradesService
};
