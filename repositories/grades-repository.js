function createGradesRepository({
  db,
  listGradesForTrainee,
  findTraineeById,
  isTrainerAssignedToTrainee
}) {
  return {
    listGradesForTrainee,
    findTraineeById,
    isTrainerAssignedToTrainee,

    findGradeOwner(gradeId) {
      return db.prepare(`
        SELECT users.id, users.name, users.username, users.email, users.ausbildung, users.betrieb, users.berufsschule
        FROM grades
        JOIN users ON users.id = grades.trainee_id
        WHERE grades.id = ? AND users.role = 'trainee'
        LIMIT 1
      `).get(gradeId);
    },

    findGrade(gradeId, traineeId) {
      return db.prepare(`
        SELECT id, fach, typ, bezeichnung, datum, note, gewicht, trainee_id
        FROM grades
        WHERE id = ? AND trainee_id = ?
      `).get(gradeId, traineeId);
    },

    createGrade(traineeId, grade) {
      db.prepare(`
        INSERT INTO grades (trainee_id, fach, typ, bezeichnung, datum, note, gewicht)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(traineeId, grade.fach, grade.typ, grade.bezeichnung, grade.datum, grade.note, grade.gewicht);
    },

    updateGrade(traineeId, grade) {
      db.prepare(`
        UPDATE grades
        SET fach = ?, typ = ?, bezeichnung = ?, datum = ?, note = ?, gewicht = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND trainee_id = ?
      `).run(grade.fach, grade.typ, grade.bezeichnung, grade.datum, grade.note, grade.gewicht, grade.id, traineeId);
    },

    findLatestGradeForTrainee(traineeId) {
      return db.prepare(`
        SELECT id, fach, typ, bezeichnung, datum, note, gewicht, trainee_id
        FROM grades
        WHERE trainee_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(traineeId);
    },

    deleteGrade(gradeId, traineeId) {
      return db.prepare("DELETE FROM grades WHERE id = ? AND trainee_id = ?").run(gradeId, traineeId);
    }
  };
}

module.exports = {
  createGradesRepository
};
