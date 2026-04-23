import React from "react";

function themeLabel(themePreference, theme) {
  if (themePreference === "system") {
    return `System (${theme === "dark" ? "dunkel" : "hell"})`;
  }
  return theme === "dark" ? "Dunkel" : "Hell";
}

export function Topbar({ user, theme, themePreference, onLogout, onToggleTheme, mobileNavOpen, onToggleNavigation }) {
  return (
    <header className="topbar">
      <div className="topbar-main">
        <button
          type="button"
          className="mobile-nav-toggle btn btn-outline-secondary"
          onClick={onToggleNavigation}
          aria-expanded={mobileNavOpen}
          aria-label="Navigation umschalten"
        >
          Menue
        </button>
        <div className="topbar-copy">
          <p className="page-kicker mb-1">Ausbildungsdoku</p>
          <div className="topbar-meta">
            <strong className="topbar-title">Arbeitsbereich</strong>
            <small className="topbar-theme-label">Ansicht: {themeLabel(themePreference, theme)}</small>
          </div>
        </div>
      </div>
      <div className="topbar-user">
        <button className="btn btn-outline-secondary" onClick={onToggleTheme} type="button">
          {theme === "dark" ? "Hell" : "Dunkel"}
        </button>
        <div className="user-pill">
          <span>{user?.name || "Gast"}</span>
          <small>{user?.username ? `@${user.username} · ${user.role}` : user?.role || "ohne Sitzung"}</small>
        </div>
        {user ? (
          <button className="btn btn-outline-secondary" onClick={onLogout} type="button">
            Abmelden
          </button>
        ) : null}
      </div>
    </header>
  );
}
