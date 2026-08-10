import React from "react";

export function FilterBar({ children, label = "Filter", className = "" }) {
  return <div className={`filter-bar${className ? ` ${className}` : ""}`} role="search" aria-label={label}>{children}</div>;
}
