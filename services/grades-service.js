const { HttpError } = require("../utils/http-error");

function createGradesService({ gradesRepository, helpers }) {
  async function resolveReadableTrainee(user, requestedTraineeId) {
    const access = await helpers.resolveReadableGradesTrainee(user, requestedTraineeId);
    if (access.error) {
      throw new HttpError(access.status || 400, access.error);
    }
    return access.trainee;
  }

  async function resolveWritableTrainee(user, requestedTraineeId, gradeId = null) {
    const access = await helpers.resolveWritableGradesTrainee(user, requestedTraineeId, gradeId);
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

  async function listGrades(user, query) {
    const trainee = await resolveReadableTrainee(user, query.traineeId);
    return {
      traineeId: trainee?.id || null,
      grades: trainee ? await gradesRepository.listGradesForTrainee(trainee.id) : []
    };
  }

  async function saveGrade(user, payload) {
    const grade = validateGrade(payload);
    const trainee = await resolveWritableTrainee(user, payload.traineeId, grade.id);
    const traineeId = trainee.id;
    const existingGrade = grade.id ? await gradesRepository.findGrade(grade.id, traineeId) : null;

    let gradeRow;
    if (grade.id) {
      await gradesRepository.updateGrade(traineeId, grade);
      gradeRow = { ...existingGrade, ...grade };
    } else {
      gradeRow = await gradesRepository.createGrade(traineeId, grade);
    }

    if (grade.id) {
      await helpers.writeAuditLog({
        actor: user,
        actionType: "GRADE_UPDATED",
        entityType: "grade",
        entityId: String(grade.id),
        targetUserId: traineeId,
        summary: `Note ${grade.bezeichnung || grade.fach} wurde aktualisiert.`,
        changes: helpers.computeChangedFields(existingGrade, grade, ["fach", "typ", "bezeichnung", "datum", "note", "gewicht"])
      });
    } else {
      await helpers.writeAuditLog({
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

    return { ok: true, traineeId, grades: await gradesRepository.listGradesForTrainee(traineeId) };
  }

  async function deleteGrade(user, gradeId) {
    const trainee = await resolveWritableTrainee(user, null, gradeId);
    const traineeId = trainee.id;
    const existingGrade = await gradesRepository.findGrade(gradeId, traineeId);
    const deletedCount = await gradesRepository.deleteGrade(gradeId, traineeId);
    if (!deletedCount) {
      throw new HttpError(404, "Note nicht gefunden.");
    }

    await helpers.writeAuditLog({
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

    return { ok: true, traineeId, grades: await gradesRepository.listGradesForTrainee(traineeId) };
  }

  async function getPdfExport(user, query) {
    const trainee = await resolveReadableTrainee(user, query.traineeId);
    if (!trainee) {
      throw new HttpError(400, "Azubi-ID fehlt.");
    }

    return {
      trainee,
      grades: await gradesRepository.listGradesForTrainee(trainee.id)
    };
  }

  return {
    listGrades,
    saveGrade,
    deleteGrade,
    getPdfExport
  };
}

module.exports = {
  createGradesService
};
