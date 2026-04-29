const { isHttpError } = require("../utils/http-error");
const { createApiError } = require("../utils/api-response");

function createErrorHandler({ logger = console } = {}) {
  return function errorHandler(error, _req, res, _next) {
    if (res.headersSent) {
      return;
    }

    if (error?.type === "entity.parse.failed") {
      res.status(400).json(createApiError({
        message: "Ungueltiges JSON im Request-Body.",
        code: "INVALID_JSON",
        requestId: res.locals.requestId
      }));
      return;
    }

    if (error?.type === "entity.too.large") {
      res.status(413).json(createApiError({
        message: "Request-Body ist zu gross.",
        code: "PAYLOAD_TOO_LARGE",
        requestId: res.locals.requestId
      }));
      return;
    }

    if (isHttpError(error)) {
      if (error.status === 429 && Number.isInteger(error.details?.retryAfterSeconds)) {
        res.setHeader("Retry-After", String(error.details.retryAfterSeconds));
      }

      if (error.status >= 500) {
        logger.error("HTTP-Fehler", {
          requestId: res.locals.requestId,
          status: error.status,
          code: error.code,
          error
        });
      }

      res.status(error.status).json(createApiError({
        message: error.message,
        code: error.code,
        details: error.details,
        requestId: res.locals.requestId
      }));
      return;
    }

    logger.error("Unbehandelter Serverfehler", {
      requestId: res.locals.requestId,
      error
    });
    res.status(500).json(createApiError({
      message: "Interner Serverfehler.",
      code: "INTERNAL_SERVER_ERROR",
      requestId: res.locals.requestId
    }));
  };
}

module.exports = {
  createErrorHandler
};
