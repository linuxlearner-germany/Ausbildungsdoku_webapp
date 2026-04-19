function createReportRepository({ db, listEntriesForTrainee, findEntryById, findEntryWithOwnerById, findTraineeById }) {
  return {
    listEntriesForTrainee,
    findEntryById,
    findEntryWithOwnerById,
    findTraineeById,

    findOwnedEntryStatus(traineeId, entryId) {
      return db.prepare(`
        SELECT id, status
        FROM entries
        WHERE id = ? AND trainee_id = ?
      `).get(entryId, traineeId);
    },

    deleteDraftEntry(traineeId, entryId) {
      return db.prepare("DELETE FROM entries WHERE id = ? AND trainee_id = ? AND status = 'draft'").run(entryId, traineeId);
    },

    insertImportedSubmittedEntries(traineeId, rows) {
      const insertEntry = db.prepare(`
        INSERT INTO entries (
          id, trainee_id, weekLabel, dateFrom, dateTo, betrieb, schule, themen, reflection,
          status, signedAt, signerName, trainerComment, rejectionReason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', 'submitted', NULL, '', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const transaction = db.transaction(() => {
        for (const row of rows) {
          insertEntry.run(
            `import-${Date.now()}-${Math.random()}`,
            traineeId,
            row.weekLabel,
            row.dateFrom,
            row.dateFrom,
            row.betrieb,
            row.schule
          );
        }
      });

      transaction();
    },

    rejectEntryWithComment(entryId, comment) {
      db.prepare(`
        UPDATE entries
        SET status = 'rejected', trainerComment = ?, rejectionReason = ?, signedAt = NULL, signerName = '', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status != 'signed'
      `).run(comment, comment, entryId);
    }
  };
}

module.exports = {
  createReportRepository
};
