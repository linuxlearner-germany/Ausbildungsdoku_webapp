import React from "react";
import { NavLink } from "react-router-dom";
import { assetUrl } from "../lib/runtime";

const items = [
  { to: "/dashboard", label: "Dashboard", roles: ["trainee", "trainer", "admin"] },
  { to: "/berichte", label: "Berichte", roles: ["trainee"] },
  { to: "/noten", label: "Noten", roles: ["trainee", "trainer", "admin"] },
  { to: "/freigaben", label: "Freigaben", roles: ["trainee", "trainer", "admin"] },
  { to: "/profil", label: "Profil", roles: ["trainee", "trainer", "admin"] },
  { to: "/export", label: "Export", roles: ["trainee"] },
  { to: "/archiv", label: "Archiv", roles: ["trainee", "trainer", "admin"] },
  { to: "/verwaltung", label: "Verwaltung", roles: ["admin"] }
];

export function SidebarNavigation({ user, mobileNavOpen, onNavigate }) {
  const visibleItems = items.filter((item) => item.roles.includes(user?.role));

  return (
    <aside className={`sidebar${mobileNavOpen ? " is-open" : ""}`}>
      <div className="sidebar-brand">
        <img src={assetUrl("/Pictures/wiweb-logo-kurz-blau_neu.png")} alt="WIWEB Logo" className="sidebar-logo" />
        <div>
          <p className="page-kicker">WIWEB</p>
          <strong>Berichtsheft Portal</strong>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label="Hauptnavigation">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
