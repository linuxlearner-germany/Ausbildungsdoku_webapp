export function isStaticDemo() {
  return typeof window !== "undefined" && window.__APP_STATIC_DEMO__ === true;
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

  if (/^(?:[a-z]+:)?\/\//i.test(normalized) || normalized.startsWith("data:") || normalized.startsWith("#")) {
    return normalized;
  }

  const basePath = getAppBasePath();
  const cleanPath = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${basePath}${cleanPath}`;
}

export function assetUrl(path) {
  return withBasePath(path);
}

export function apiUrl(path) {
  if (typeof window !== "undefined" && window.__APP_API_BASE_URL__) {
    const base = String(window.__APP_API_BASE_URL__).replace(/\/$/, "");
    const cleanPath = String(path || "").trim();
    if (!cleanPath || cleanPath === "/") {
      return base || "/";
    }
    if (/^(?:[a-z]+:)?\/\//i.test(cleanPath)) {
      return cleanPath;
    }

    return `${base}${cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`}`;
  }

  return withBasePath(path);
}
