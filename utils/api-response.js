function createApiSuccess(data, meta = null) {
  const payload = {
    ok: true,
    data
  };

  if (meta) {
    payload.meta = meta;
  }

  return payload;
}

function createApiError({ message, code = "INTERNAL_ERROR", details = null, requestId = null }) {
  const payload = {
    ok: false,
    error: {
      message,
      code
    }
  };

  if (details) {
    payload.error.details = details;
  }

  if (requestId) {
    payload.requestId = requestId;
  }

  return payload;
}

module.exports = {
  createApiSuccess,
  createApiError
};
