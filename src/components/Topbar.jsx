import React from "react";

export function Topbar({ user, theme, onLogout, onToggleTheme, mobileNavOpen, onToggleNavigation }) {
  return (
    <header className="topbar">
      <div className="topbar-main">
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={onToggleNavigation}
          aria-expanded={mobileNavOpen}
          aria-label="Navigation umschalten"
        >
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-copy">
          <p className="page-kicker">Berichtsheft Portal</p>
          <strong>Internes Ausbildungsportal</strong>
          <small className="topbar-theme-label">{theme === "dark" ? "Darkmode aktiv" : "Lightmode aktiv"}</small>
        </div>
      </div>
      <div className="topbar-user">
        <button className="button button-secondary" onClick={onToggleTheme} type="button">
          {theme === "dark" ? "Lightmode" : "Darkmode"}
        </button>
        <div className="user-pill">
          <span>{user?.name || "Gast"}</span>
          <small>{user?.role || "ohne Sitzung"}</small>
        </div>
        {user ? (
          <button className="button button-secondary" onClick={onLogout} type="button">
            Logout
          </button>
        ) : null}
      </div>
    </header>
  );
}
