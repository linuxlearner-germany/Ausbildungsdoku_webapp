class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status || 500;
    this.code = options.code || "HTTP_ERROR";
    this.details = options.details || null;
  }
}

function isHttpError(error) {
  return error instanceof HttpError;
}

module.exports = {
  HttpError,
  isHttpError
};
