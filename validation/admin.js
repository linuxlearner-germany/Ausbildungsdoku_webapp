const { z } = require("zod");

const adminUserPayloadSchema = z.object({
  name: z.string().trim().min(1, "Ungueltige Nutzerdaten."),
  username: z.string().optional(),
  email: z.string().trim().min(1, "Ungueltige Nutzerdaten."),
  role: z.enum(["trainee", "trainer", "admin"], { message: "Ungueltige Nutzerdaten." }),
  password: z.string().optional().default(""),
  ausbildung: z.string().optional().default(""),
  betrieb: z.string().optional().default(""),
  berufsschule: z.string().optional().default(""),
  ausbildungsStart: z.string().optional().default(""),
  ausbildungsEnde: z.string().optional().default(""),
  trainerIds: z.array(z.union([z.number(), z.string()])).optional().default([])
}).passthrough();

const assignTrainerSchema = z.object({
  traineeId: z.coerce.number().int("Ungueltiger Azubi."),
  trainerIds: z.array(z.union([z.number(), z.string()])).optional().default([])
});

const auditLogQuerySchema = z.object({
  page: z.any().optional(),
  pageSize: z.any().optional(),
  actionType: z.string().optional().default(""),
  userId: z.any().optional(),
  search: z.string().optional().default(""),
  from: z.string().optional().default(""),
  to: z.string().optional().default("")
});

const profilePayloadSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt."),
  ausbildung: z.string().optional().default(""),
  betrieb: z.string().optional().default(""),
  berufsschule: z.string().optional().default("")
});

module.exports = {
  adminUserPayloadSchema,
  assignTrainerSchema,
  auditLogQuerySchema,
  profilePayloadSchema
};
