const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function normalizeLevel(level) {
  return LEVELS[String(level || "").toLowerCase()] ? String(level).toLowerCase() : "info";
}

function serializeError(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause ? serializeError(error.cause) : null
  };
}

function createLogger(level = "info", baseFields = {}) {
  const normalizedLevel = normalizeLevel(level);

  function shouldLog(targetLevel) {
    return LEVELS[targetLevel] >= LEVELS[normalizedLevel];
  }

  function write(targetLevel, message, fields = {}) {
    if (!shouldLog(targetLevel)) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level: targetLevel,
      message,
      ...baseFields,
      ...fields
    };

    if (payload.error instanceof Error) {
      payload.error = serializeError(payload.error);
    }

    const output = JSON.stringify(payload);
    if (targetLevel === "error" || targetLevel === "warn") {
      console.error(output);
      return;
    }

    console.log(output);
  }

  return {
    debug(message, fields) {
      write("debug", message, fields);
    },
    info(message, fields) {
      write("info", message, fields);
    },
    warn(message, fields) {
      write("warn", message, fields);
    },
    error(message, fields) {
      write("error", message, fields);
    }
  };
}

module.exports = {
  createLogger
};
