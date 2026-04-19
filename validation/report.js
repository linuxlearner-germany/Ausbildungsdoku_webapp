const { z } = require("zod");

const importPayloadSchema = z.object({
  filename: z.string().trim().min(1, "Dateiinhalt fehlt."),
  contentBase64: z.string().trim().min(1, "Dateiinhalt fehlt.")
});

const entryPayloadSchema = z.object({
  id: z.any().optional(),
  weekLabel: z.any().optional(),
  dateFrom: z.any().optional(),
  dateTo: z.any().optional(),
  betrieb: z.any().optional(),
  schule: z.any().optional(),
  status: z.any().optional(),
  signedAt: z.any().optional(),
  signerName: z.any().optional(),
  trainerComment: z.any().optional(),
  rejectionReason: z.any().optional()
}).passthrough();

const reportUpsertSchema = z.object({
  entries: z.array(entryPayloadSchema)
});

const submitReportSchema = z.object({
  entryId: z.string().trim().min(1, "Eintrag fehlt.")
});

const batchSubmitSchema = z.object({
  entryIds: z.array(z.string().trim().min(1)).min(1, "Keine Einträge ausgewählt.")
});

const trainerSignSchema = z.object({
  entryId: z.string().trim().min(1, "Eintrag fehlt."),
  trainerComment: z.string().optional().default("")
});

const trainerRejectSchema = z.object({
  entryId: z.string().trim().min(1, "Eintrag fehlt."),
  reason: z.string().trim().min(1, "Ablehnungsgrund fehlt.")
});

const trainerCommentSchema = z.object({
  entryId: z.string().trim().min(1, "Eintrag fehlt."),
  comment: z.string().trim().min(1, "Kommentar fehlt.")
});

const trainerBatchSchema = z.object({
  action: z.enum(["sign", "reject"]),
  entryIds: z.array(z.string().trim().min(1)).min(1, "Keine Einträge ausgewählt."),
  trainerComment: z.string().optional().default(""),
  reason: z.string().optional().default("")
});

module.exports = {
  importPayloadSchema,
  entryPayloadSchema,
  reportUpsertSchema,
  submitReportSchema,
  batchSubmitSchema,
  trainerSignSchema,
  trainerRejectSchema,
  trainerCommentSchema,
  trainerBatchSchema
};
