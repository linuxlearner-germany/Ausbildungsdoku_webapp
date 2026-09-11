import React from "react";
import { assetUrl } from "../lib/runtime";

const SUPPORTED_SIZES = new Set(["small", "medium", "large"]);
const SUPPORTED_VARIANTS = new Set(["default", "sidebar", "auth"]);

export function BrandLogo({ size = "medium", variant = "default", className = "" }) {
  const resolvedSize = SUPPORTED_SIZES.has(size) ? size : "medium";
  const resolvedVariant = SUPPORTED_VARIANTS.has(variant) ? variant : "default";
  const classes = ["brand-logo", `brand-logo--${resolvedSize}`, `brand-logo--${resolvedVariant}`, className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <img src={assetUrl("/Pictures/logo-short.png")} alt="WIWEB" />
    </span>
  );
}
