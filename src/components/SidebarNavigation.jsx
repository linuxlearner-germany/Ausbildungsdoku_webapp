import React from "react";
import { NavLink } from "react-router-dom";
import { assetUrl } from "../lib/runtime";
import { getMenuItemsForRole } from "../navigation/menuConfig.mjs";

export function SidebarNavigation({ user, mobileNavOpen, onNavigate }) {
  const visibleItems = getMenuItemsForRole(user?.role);

  return (
    <aside className={`sidebar${mobileNavOpen ? " is-open" : ""}`} aria-label="Seitenleiste">
      <div className="sidebar-brand">
        <img src={assetUrl("/Pictures/wiweb-logo-kurz-blau_neu.png")} alt="WIWEB Logo" className="sidebar-logo" />
        <div>
          <strong className="d-block">Ausbildungsdoku</strong>
          <small className="text-body-secondary">Digitales Berichtsheft</small>
        </div>
      </div>
      <div className="sidebar-divider" aria-hidden="true" />
      <nav className="sidebar-nav nav flex-column" aria-label="Hauptnavigation">
        {visibleItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => `sidebar-link nav-link${isActive ? " active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
