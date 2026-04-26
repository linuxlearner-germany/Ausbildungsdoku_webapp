const { ZodError } = require("zod");
const { HttpError } = require("./http-error");

function formatIssuePath(issue) {
  if (!issue?.path?.length) {
    return "request";
  }

  return issue.path.join(".");
}

function parseSchema(schema, payload) {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, error.issues[0]?.message || "Ungueltige Eingabedaten.", {
        code: "VALIDATION_FAILED",
        details: {
          issues: error.issues.map((issue) => ({
            path: formatIssuePath(issue),
            message: issue.message
          }))
        }
      });
    }

    throw error;
  }
}

module.exports = {
  parseSchema
};
