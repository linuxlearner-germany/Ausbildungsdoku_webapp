export const THEME_STORAGE_KEY = "berichtsheft-theme";

export function isThemePreference(value) {
  return ["light", "dark", "system"].includes(value);
}

export function resolveTheme(preference, prefersDark = false) {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  return prefersDark ? "dark" : "light";
}

export function getSystemPrefersDark() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readStoredThemePreference(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return "system";
  }

  const stored = storage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

export function applyThemeAttribute(theme) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.setAttribute("data-theme", theme);
}

export function initializeTheme(preference = null, storage = typeof window !== "undefined" ? window.localStorage : null) {
  const effectivePreference = isThemePreference(preference) ? preference : readStoredThemePreference(storage);
  const theme = resolveTheme(effectivePreference, getSystemPrefersDark());
  applyThemeAttribute(theme);
  return { preference: effectivePreference, theme };
}
