export function isStaticDemo() {
  return typeof window !== "undefined" && window.__APP_STATIC_DEMO__ === true;
}

function isAbsoluteUrl(value) {
  return /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("data:") || value.startsWith("#");
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizePath(value) {
  const path = String(value || "").trim();
  if (!path || path === "/") {
    return "";
  }

  return `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function joinUrl(base, path) {
  const normalizedBase = trimTrailingSlash(base);
  const normalizedPath = normalizePath(path);

  if (!normalizedPath) {
    return normalizedBase || "/";
  }

  if (!normalizedBase) {
    return normalizedPath;
  }

  if (normalizedBase.endsWith("/api") && normalizedPath === "/api") {
    return normalizedBase;
  }

  if (normalizedBase.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${normalizedBase}${normalizedPath.slice(4)}`;
  }

  return `${normalizedBase}${normalizedPath}`;
}

export function getAppBasePath() {
  if (typeof window === "undefined") {
    return "";
  }

  const value = String(window.__APP_BASE_PATH__ || "").trim();
  if (!value || value === "/") {
    return "";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function withBasePath(path) {
  const normalized = String(path || "").trim();
  if (!normalized) {
    return getAppBasePath() || "/";
  }

  if (isAbsoluteUrl(normalized)) {
    return normalized;
  }

  return joinUrl(getAppBasePath(), normalized);
}

export function assetUrl(path) {
  return withBasePath(path);
}

export function apiUrl(path) {
  if (typeof window !== "undefined" && window.__APP_API_BASE_URL__) {
    const cleanPath = String(path || "").trim();
    if (!cleanPath || cleanPath === "/") {
      return trimTrailingSlash(window.__APP_API_BASE_URL__) || "/";
    }
    if (isAbsoluteUrl(cleanPath)) {
      return cleanPath;
    }

    return joinUrl(window.__APP_API_BASE_URL__, cleanPath);
  }

  return withBasePath(path);
}
