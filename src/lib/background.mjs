import { assetUrl } from "./runtime.js";

export const BACKGROUND_STORAGE_KEY = "ausbildungsdoku-background";
export const DEFAULT_BACKGROUND = "standard";

export const BACKGROUND_REGISTRY = Object.freeze([
  { key: "none", label: "Kein Hintergrund", path: null },
  { key: "standard", label: "Standard", path: "/Pictures/Backgrounds/standard.png" },
  { key: "modern", label: "Modern", path: "/Pictures/Backgrounds/desktop-full-hd-modern.png" },
  {
    key: "modern-logo",
    label: "Modern – Logo rechts",
    path: "/Pictures/Backgrounds/desktop-full-hd-modern-logo-rechts.png",
    position: "center right",
    sources: [
      { minWidth: 3200, path: "/Pictures/Backgrounds/desktop-4k-modern-logo-rechts.png" },
      { minWidth: 2200, path: "/Pictures/Backgrounds/desktop-2560-modern-logo-rechts.png" }
    ]
  },
  { key: "wiweb", label: "WIWEB", path: "/Pictures/Backgrounds/desktop-full-hd-wiweb.png" },
  { key: "wiweb-circle", label: "WIWEB Kreis", path: "/Pictures/Backgrounds/desktop-full-hd-wiweb-kreis.png" },
  { key: "alternative-1", label: "Alternative 1", path: "/Pictures/Backgrounds/desktop-full-hd-alternative-1-jpeg.jpg" },
  { key: "alternative-2", label: "Alternative 2", path: "/Pictures/Backgrounds/desktop-full-hd-alternative-2.png" },
  { key: "windows-1", label: "Windows 1", path: "/Pictures/Backgrounds/windows-hintergrund-1.jpg" },
  { key: "windows-2", label: "Windows 2", path: "/Pictures/Backgrounds/windows-hintergrund-2.jpg" },
  { key: "windows-3", label: "Windows 3", path: "/Pictures/Backgrounds/windows-hintergrund-3.jpg" },
  { key: "windows-4", label: "Windows 4", path: "/Pictures/Backgrounds/windows-hintergrund-4.jpg" }
].map(Object.freeze));

export function isBackgroundPreference(value) {
  return BACKGROUND_REGISTRY.some((background) => background.key === value);
}

export function normalizeBackgroundPreference(value) {
  return isBackgroundPreference(value) ? value : DEFAULT_BACKGROUND;
}

export function readStoredBackgroundPreference(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return DEFAULT_BACKGROUND;
  }

  const preference = normalizeBackgroundPreference(storage.getItem(BACKGROUND_STORAGE_KEY));
  if (typeof storage.setItem === "function") {
    storage.setItem(BACKGROUND_STORAGE_KEY, preference);
  }
  return preference;
}

export function saveStoredBackgroundPreference(storage, value) {
  const preference = normalizeBackgroundPreference(value);
  if (storage && typeof storage.setItem === "function") {
    storage.setItem(BACKGROUND_STORAGE_KEY, preference);
  }
  return preference;
}

export function getBackground(value) {
  const preference = normalizeBackgroundPreference(value);
  return BACKGROUND_REGISTRY.find((background) => background.key === preference);
}

export function getBackgroundPath(value, viewportWidth = 1920) {
  const background = getBackground(value);
  if (!background.path) return null;
  const source = background.sources?.find((candidate) => viewportWidth >= candidate.minWidth);
  return source?.path || background.path;
}

export function getBackgroundUrl(value, viewportWidth = 1920) {
  const path = getBackgroundPath(value, viewportWidth);
  return path ? assetUrl(path) : null;
}
