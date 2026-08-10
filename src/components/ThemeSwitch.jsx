import React from "react";

export function ThemeSwitch({ theme, onToggle, compact = false }) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={`theme-switch${compact ? " compact" : ""}`}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Dunkelmodus ausschalten" : "Dunkelmodus einschalten"}
      onClick={onToggle}
    >
      <span className="theme-switch-icon" aria-hidden="true">{dark ? "☾" : "☀"}</span>
      <span className="theme-switch-track" aria-hidden="true"><span className="theme-switch-thumb" /></span>
    </button>
  );
}
