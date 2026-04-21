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

    async findGradeOwner(gradeId) {
      return db("grades")
        .join("users", "users.id", "grades.trainee_id")
        .select("users.id", "users.name", "users.username", "users.email", "users.ausbildung", "users.betrieb", "users.berufsschule")
        .where("grades.id", gradeId)
        .andWhere("users.role", "trainee")
        .first();
    },

    async findGrade(gradeId, traineeId) {
      return db("grades")
        .select("id", "fach", "typ", "bezeichnung", "datum", "note", "gewicht", "trainee_id")
        .where({ id: gradeId, trainee_id: traineeId })
        .first();
    },

    async createGrade(traineeId, grade) {
      const [created] = await db("grades").insert({
        trainee_id: traineeId,
        fach: grade.fach,
        typ: grade.typ,
        bezeichnung: grade.bezeichnung,
        datum: grade.datum,
        note: grade.note,
        gewicht: grade.gewicht
      }, ["id"]);
      return created;
    },

    async updateGrade(traineeId, grade) {
      await db("grades")
        .where({ id: grade.id, trainee_id: traineeId })
        .update({
          fach: grade.fach,
          typ: grade.typ,
          bezeichnung: grade.bezeichnung,
          datum: grade.datum,
          note: grade.note,
          gewicht: grade.gewicht,
          updated_at: db.fn.now()
        });
    },

    async findLatestGradeForTrainee(traineeId) {
      return db("grades")
        .select("id", "fach", "typ", "bezeichnung", "datum", "note", "gewicht", "trainee_id")
        .where({ trainee_id: traineeId })
        .orderBy("id", "desc")
        .first();
    },

    async deleteGrade(gradeId, traineeId) {
      return db("grades")
        .where({ id: gradeId, trainee_id: traineeId })
        .del();
    },

    async gradeExistsForTrainee(gradeId, traineeId) {
      const existing = await db("grades").where({ id: gradeId, trainee_id: traineeId }).first("id");
      return Boolean(existing);
    }
  };
}

module.exports = {
  createGradesRepository
};
