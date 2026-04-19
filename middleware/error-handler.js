const { isHttpError } = require("../utils/http-error");

function createErrorHandler() {
  return function errorHandler(error, _req, res, _next) {
    if (res.headersSent) {
      return;
    }

    if (isHttpError(error)) {
      const payload = { error: error.message };
      if (error.code) {
        payload.code = error.code;
      }
      if (error.details) {
        payload.details = error.details;
      }
      res.status(error.status).json(payload);
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Interner Serverfehler." });
  };
}

module.exports = {
  createErrorHandler
};
