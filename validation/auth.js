const { z } = require("zod");

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string()
});

const themePreferenceSchema = z.object({
  themePreference: z.enum(["light", "dark", "system"])
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Aktuelles Passwort fehlt."),
  newPassword: z.string().min(10, "Neues Passwort muss mindestens 10 Zeichen lang sein."),
  newPasswordRepeat: z.string()
}).superRefine((value, context) => {
  if (value.newPassword !== value.newPasswordRepeat) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Neues Passwort und Wiederholung stimmen nicht ueberein.",
      path: ["newPasswordRepeat"]
    });
  }

  if (value.newPassword === value.currentPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.",
      path: ["newPassword"]
    });
  }
});

module.exports = {
  loginSchema,
  themePreferenceSchema,
  passwordChangeSchema
};
