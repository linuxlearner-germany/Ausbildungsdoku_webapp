import React from "react";

export function FilterBar({ children, label = "Filter" }) {
  return <div className="filter-bar" role="search" aria-label={label}>{children}</div>;
}
