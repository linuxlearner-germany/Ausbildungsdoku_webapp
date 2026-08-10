import backgrounds from "../../shared/login-backgrounds.json" with { type: "json" };
import { assetUrl } from "./runtime.js";

export const DEFAULT_LOGIN_BACKGROUND = "standard";
export const LOGIN_BACKGROUND_REGISTRY = Object.freeze(backgrounds.map((background) => Object.freeze(background)));

export function isLoginBackground(value) {
  return LOGIN_BACKGROUND_REGISTRY.some((background) => background.key === value);
}

export function normalizeLoginBackground(value) {
  return isLoginBackground(value) ? value : DEFAULT_LOGIN_BACKGROUND;
}

export function getLoginBackground(value) {
  const key = normalizeLoginBackground(value);
  return LOGIN_BACKGROUND_REGISTRY.find((background) => background.key === key);
}

export function getLoginBackgroundUrl(value, viewportWidth = 1920) {
  const background = getLoginBackground(value);
  const source = [...(background.sources || [])]
    .sort((left, right) => right.minWidth - left.minWidth)
    .find((candidate) => viewportWidth >= candidate.minWidth);
  return assetUrl(source?.path || background.path);
}
