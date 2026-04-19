const { z } = require("zod");

const gradePayloadSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  traineeId: z.union([z.number(), z.string()]).optional(),
  fach: z.string().trim().min(1, "Ungueltige Notendaten."),
  typ: z.enum(["Schulaufgabe", "Stegreifaufgabe"], { message: "Ungueltige Notendaten." }),
  bezeichnung: z.string().trim().min(1, "Ungueltige Notendaten."),
  datum: z.string().trim().min(1, "Ungueltige Notendaten."),
  note: z.union([z.number(), z.string()]),
  gewicht: z.any().optional()
}).passthrough();

const gradesQuerySchema = z.object({
  traineeId: z.any().optional()
});

module.exports = {
  gradePayloadSchema,
  gradesQuerySchema
};
