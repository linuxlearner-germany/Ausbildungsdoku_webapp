import React from "react";

function roleLabel(role) {
  if (role === "trainee") return "Azubi";
  if (role === "trainer") return "Ausbilder";
  if (role === "admin") return "Admin";
  return role || "ohne Sitzung";
}

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
          Menü
        </button>
        <div className="topbar-copy">
          <p className="page-kicker mb-1">Ausbildungsdoku</p>
          <div className="topbar-meta">
            <strong className="topbar-title">Digitales Berichtsheft</strong>
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
          <small>{user?.username ? `@${user.username} · ${roleLabel(user.role)}` : roleLabel(user?.role)}</small>
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
