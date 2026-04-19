function createGradesDomainService({ db, gradesRepository, sharedRepository }) {
  function weightForGradeType(type) {
    return type === "Schulaufgabe" ? 2 : 1;
  }

  function parseTraineeId(value) {
    const traineeId = Number(value);
    return Number.isInteger(traineeId) ? traineeId : null;
  }

  function resolveReadableGradesTrainee(user, requestedTraineeId) {
    if (user.role === "trainee") {
      return { trainee: sharedRepository.findTraineeById(user.id) };
    }

    if (requestedTraineeId == null || requestedTraineeId === "") {
      return { trainee: null };
    }

    const traineeId = parseTraineeId(requestedTraineeId);
    if (!traineeId) {
      return { error: "Ungueltige Azubi-ID.", status: 400 };
    }

    const trainee = sharedRepository.findTraineeById(traineeId);
    if (!trainee) {
      return { error: "Azubi nicht gefunden.", status: 404 };
    }

    if (user.role === "trainer" && !sharedRepository.isTrainerAssignedToTrainee(user.id, traineeId)) {
      return { error: "Keine Berechtigung.", status: 403 };
    }

    if (user.role !== "admin" && user.role !== "trainer") {
      return { error: "Keine Berechtigung.", status: 403 };
    }

    return { trainee };
  }

  function resolveWritableGradesTrainee(user, requestedTraineeId, gradeId = null) {
    if (user.role === "trainee") {
      if (gradeId) {
        const existing = db.prepare("SELECT id FROM grades WHERE id = ? AND trainee_id = ?").get(gradeId, user.id);
        if (!existing) {
          return { error: "Note nicht gefunden.", status: 404 };
        }
      }

      return { trainee: sharedRepository.findTraineeById(user.id) };
    }

    if (user.role !== "admin") {
      return { error: "Keine Berechtigung.", status: 403 };
    }

    if (gradeId) {
      const gradeOwner = gradesRepository.findGradeOwner(gradeId);
      if (!gradeOwner) {
        return { error: "Note nicht gefunden.", status: 404 };
      }

      return { trainee: gradeOwner };
    }

    const traineeId = parseTraineeId(requestedTraineeId);
    if (!traineeId) {
      return { error: "Azubi-ID fehlt.", status: 400 };
    }

    const trainee = sharedRepository.findTraineeById(traineeId);
    if (!trainee) {
      return { error: "Azubi nicht gefunden.", status: 404 };
    }

    return { trainee };
  }

  function validateGrade(input) {
    const fach = String(input.fach || "").trim();
    const typ = String(input.typ || "").trim();
    const bezeichnung = String(input.bezeichnung || "").trim();
    const datum = String(input.datum || "").trim();
    const note = Number(input.note);

    if (!fach || !["Schulaufgabe", "Stegreifaufgabe"].includes(typ) || !bezeichnung || !datum || !Number.isFinite(note)) {
      return { error: "Ungueltige Notendaten." };
    }

    if (note < 1 || note > 6) {
      return { error: "Note muss zwischen 1 und 6 liegen." };
    }

    return {
      data: {
        id: input.id ? Number(input.id) : null,
        fach,
        typ,
        bezeichnung,
        datum,
        note,
        gewicht: weightForGradeType(typ)
      }
    };
  }

  return {
    resolveReadableGradesTrainee,
    resolveWritableGradesTrainee,
    validateGrade
  };
}

module.exports = {
  createGradesDomainService
};
