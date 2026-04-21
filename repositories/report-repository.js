const crypto = require("crypto");

function createReportRepository({ db, listEntriesForTrainee, findEntryById, findEntryWithOwnerById, findTraineeById }) {
  return {
    listEntriesForTrainee,
    findEntryById,
    findEntryWithOwnerById,
    findTraineeById,

    async findOwnedEntryStatus(traineeId, entryId) {
      return db("entries")
        .select("id", "status")
        .where({ id: entryId, trainee_id: traineeId })
        .first();
    },

    async deleteDraftEntry(traineeId, entryId) {
      return db("entries")
        .where({ id: entryId, trainee_id: traineeId, status: "draft" })
        .del();
    },

    async insertImportedSubmittedEntries(traineeId, rows) {
      await db.transaction(async (trx) => {
        for (const row of rows) {
          await trx("entries").insert({
            id: crypto.randomUUID(),
            trainee_id: traineeId,
            weekLabel: row.weekLabel,
            dateFrom: row.dateFrom,
            dateTo: row.dateFrom,
            betrieb: row.betrieb,
            schule: row.schule,
            themen: "",
            reflection: "",
            status: "submitted",
            signedAt: null,
            signerName: "",
            trainerComment: "",
            rejectionReason: ""
          });
        }
      });
    },

    async rejectEntryWithComment(entryId, comment) {
      return db("entries")
        .where({ id: entryId })
        .whereNot({ status: "signed" })
        .update({
          status: "rejected",
          trainerComment: comment,
          rejectionReason: comment,
          signedAt: null,
          signerName: "",
          updated_at: db.fn.now()
        });
    },

    async findEntryForSubmission(traineeId, entryId) {
      return db("entries")
        .select("id", "weekLabel", "dateFrom", "dateTo", "betrieb", "schule", "status")
        .where({ id: entryId, trainee_id: traineeId })
        .first();
    },

    async submitEntry(traineeId, entryId) {
      return db("entries")
        .where({ id: entryId, trainee_id: traineeId })
        .whereNot({ status: "signed" })
        .update({
          status: "submitted",
          rejectionReason: "",
          updated_at: db.fn.now()
        });
    },

    async signEntry(entryId, signerName, trainerComment, signedAt) {
      return db("entries")
        .where({ id: entryId, status: "submitted" })
        .update({
          status: "signed",
          signedAt,
          signerName,
          trainerComment,
          rejectionReason: "",
          updated_at: db.fn.now()
        });
    },

    async rejectSubmittedEntry(entryId, reason) {
      return db("entries")
        .where({ id: entryId, status: "submitted" })
        .update({
          status: "rejected",
          signedAt: null,
          signerName: "",
          trainerComment: reason,
          rejectionReason: reason,
          updated_at: db.fn.now()
        });
    },

    async createDraftEntry(traineeId, entry) {
      await db("entries").insert({
        id: entry.id,
        trainee_id: traineeId,
        weekLabel: entry.weekLabel,
        dateFrom: entry.dateFrom,
        dateTo: entry.dateTo,
        betrieb: entry.betrieb,
        schule: entry.schule,
        themen: "",
        reflection: "",
        status: entry.status,
        signedAt: entry.signedAt,
        signerName: entry.signerName,
        trainerComment: entry.trainerComment,
        rejectionReason: entry.rejectionReason
      });
    },

    async updateEntry(traineeId, entry) {
      return db("entries")
        .where({ id: entry.id, trainee_id: traineeId })
        .update({
          weekLabel: entry.weekLabel,
          dateFrom: entry.dateFrom,
          dateTo: entry.dateTo,
          betrieb: entry.betrieb,
          schule: entry.schule,
          status: entry.status,
          signedAt: entry.signedAt,
          signerName: entry.signerName,
          trainerComment: entry.trainerComment,
          rejectionReason: entry.rejectionReason,
          updated_at: db.fn.now()
        });
    },

    async upsertEntries(traineeId, entries) {
      await db.transaction(async (trx) => {
        for (const entry of entries) {
          const existing = await trx("entries").where({ id: entry.id, trainee_id: traineeId }).first("id");
          if (existing) {
            await trx("entries")
              .where({ id: entry.id, trainee_id: traineeId })
              .update({
                weekLabel: entry.weekLabel,
                dateFrom: entry.dateFrom,
                dateTo: entry.dateTo,
                betrieb: entry.betrieb,
                schule: entry.schule,
                status: entry.status,
                signedAt: entry.signedAt,
                signerName: entry.signerName,
                trainerComment: entry.trainerComment,
                rejectionReason: entry.rejectionReason,
                updated_at: trx.fn.now()
              });
          } else {
            await trx("entries").insert({
              id: entry.id,
              trainee_id: traineeId,
              weekLabel: entry.weekLabel,
              dateFrom: entry.dateFrom,
              dateTo: entry.dateTo,
              betrieb: entry.betrieb,
              schule: entry.schule,
              themen: "",
              reflection: "",
              status: entry.status,
              signedAt: entry.signedAt,
              signerName: entry.signerName,
              trainerComment: entry.trainerComment,
              rejectionReason: entry.rejectionReason
            });
          }
        }
      });
    }
  };
}

module.exports = {
  createReportRepository
};
