import { apiUrl } from "./runtime";

export class ApiClientError extends Error {
  constructor(message, { status, code, details, method, path } = {}) {
    super(message);
    this.name = "ApiClientError";
    this.status = status || 500;
    this.code = code || null;
    this.details = details || null;
    this.method = method || "GET";
    this.path = path || "";
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
}

async function parseErrorMessage(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return fallbackMessage;
  }

  try {
    const text = (await response.text()).trim();
    return text || fallbackMessage;
  } catch (_error) {
    return fallbackMessage;
  }
}

function getApiError(data) {
  if (!data) {
    return null;
  }

  if (typeof data.error === "string") {
    return {
      message: data.error,
      code: data.code || null,
      details: data.details || null
    };
  }

  if (data.error && typeof data.error === "object") {
    return {
      message: data.error.message || "Anfrage fehlgeschlagen.",
      code: data.error.code || null,
      details: data.error.details || null
    };
  }

  return null;
}

async function request(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const hasJsonBody = options.body !== undefined;
  const targetPath = apiUrl(path);
  const response = await fetch(targetPath, {
    credentials: "same-origin",
    headers: {
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    ...options,
    method
  });

  const data = await parseResponse(response);
  if (!response.ok) {
    const apiError = getApiError(data);
    throw new ApiClientError(apiError?.message || await parseErrorMessage(response, "Anfrage fehlgeschlagen."), {
      status: response.status,
      code: apiError?.code,
      details: apiError?.details,
      method,
      path: targetPath
    });
  }

  return data;
}

export const apiClient = {
  request,
  get(path, options = {}) {
    return request(path, { ...options, method: "GET" });
  },
  post(path, body, options = {}) {
    return request(path, { ...options, method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  },
  put(path, body, options = {}) {
    return request(path, { ...options, method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
  },
  delete(path, options = {}) {
    return request(path, { ...options, method: "DELETE" });
  }
};

export function api(path, options = {}) {
  return request(path, options);
}
