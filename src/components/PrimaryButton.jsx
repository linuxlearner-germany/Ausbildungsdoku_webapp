import React from "react";

export function PrimaryButton({ children, variant = "primary", ...props }) {
  return (
    <button className={`btn ${variant === "primary" ? "btn-primary" : "btn-outline-secondary"} app-btn`} {...props}>
      {children}
    </button>
  );
}
