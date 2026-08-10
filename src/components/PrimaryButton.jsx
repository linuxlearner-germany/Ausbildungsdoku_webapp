import React from "react";

export function PrimaryButton({ children, variant = "primary", className = "", ...props }) {
  const variantClass = variant === "danger" ? "btn-danger" : variant === "ghost" || variant === "secondary" ? "btn-outline-secondary" : "btn-primary";
  return (
    <button className={`btn ${variantClass} app-btn ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
