import React from "react";
import { assetUrl } from "../lib/runtime";

const SUPPORTED_SIZES = new Set(["small", "medium", "large"]);

export function BrandLogo({ size = "medium", className = "" }) {
  const resolvedSize = SUPPORTED_SIZES.has(size) ? size : "medium";
  const classes = ["brand-logo", `brand-logo--${resolvedSize}`, className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <img src={assetUrl("/Pictures/logo-short.png")} alt="WIWEB" />
    </span>
  );
}
