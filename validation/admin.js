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

const emailRelaySettingsSchema = z.object({
  enabled: z.boolean().optional().default(false),
  host: z.string().trim().optional().default(""),
  port: z.coerce.number().int().min(1).max(65535).optional().default(587),
  secure: z.boolean().optional().default(false),
  requireTls: z.boolean().optional().default(true),
  htmlEnabled: z.boolean().optional().default(true),
  username: z.string().trim().optional().default(""),
  password: z.string().optional().default(""),
  clearPassword: z.boolean().optional().default(false),
  from: z.string().trim().optional().default(""),
  replyTo: z.string().trim().optional().default("")
});

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

const loginBackgroundSettingsSchema = z.object({
  background: z.string().trim().min(1, "Login-Hintergrund fehlt.")
});

module.exports = {
  adminUserPayloadSchema,
  emailRelaySettingsSchema,
  assignTrainerSchema,
  auditLogQuerySchema,
  profilePayloadSchema,
  loginBackgroundSettingsSchema
};
