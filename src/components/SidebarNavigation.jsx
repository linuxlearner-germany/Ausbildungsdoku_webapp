import React, { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { getMenuItemsForRole } from "../navigation/menuConfig.mjs";
import { BrandLogo } from "./BrandLogo";
import { ThemeSwitch } from "./ThemeSwitch";

const GROUP_LABELS = {
  core: "Übersicht",
  work: "Arbeitsbereiche",
  admin: "Administration",
  account: "Konto"
};

const ICON_PATHS = {
  dashboard: ["M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"],
  reports: ["M7 3h7l4 4v14H7z", "M14 3v5h5M10 12h5M10 16h5"],
  grades: ["M5 19V9M12 19V5M19 19v-7", "M3 21h18"],
  approvals: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "m8 12 2.5 2.5L16 9"],
  exports: ["M12 3v12m0 0 4-4m-4 4-4-4", "M5 15v5h14v-5"],
  archive: ["M4 7h16v13H4z", "M3 4h18v3H3zM9 11h6"],
  "admin-create-user": ["M15 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2", "M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6m-3-3h6"],
  "admin-users": ["M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 11a4 4 0 0 0 0-8M22 20v-2a4 4 0 0 0-3-3.87"],
  "admin-assignments": ["M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15", "M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"],
  "admin-audit-log": ["M9 5h6M9 3h6v4H9z", "M6 5H4v16h16V5h-2M8 12h8M8 16h6"],
  "admin-email-relay": ["M3 5h18v14H3z", "m3 8 9 6 9-6"],
  profile: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"]
};

function NavigationIcon({ name }) {
  const paths = ICON_PATHS[name] || ICON_PATHS.dashboard;
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths.map((path, index) => <path key={`${name}-${index}`} d={path} />)}
    </svg>
  );
}

function roleLabel(role) {
  if (role === "trainee") return "Azubi";
  if (role === "trainer") return "Ausbilder";
  if (role === "admin") return "Administrator";
  return role || "Benutzer";
}

function initials(user) {
  const value = user?.name || user?.username || "B";
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function SidebarNavigation({ user, theme, onLogout, onToggleTheme }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userAreaRef = useRef(null);
  const roleItems = getMenuItemsForRole(user?.role);
  const visibleItems = user?.passwordChangeRequired
    ? roleItems.filter((item) => item.key === "profile")
    : roleItems.filter((item) => item.group !== "account");
  const groups = [...new Set(visibleItems.map((item) => item.group))];

  useEffect(() => {
    if (!userMenuOpen) return undefined;
    function closeUserMenu(event) {
      if (event.key === "Escape" || (event.type === "pointerdown" && !userAreaRef.current?.contains(event.target))) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("keydown", closeUserMenu);
    document.addEventListener("pointerdown", closeUserMenu);
    return () => {
      document.removeEventListener("keydown", closeUserMenu);
      document.removeEventListener("pointerdown", closeUserMenu);
    };
  }, [userMenuOpen]);

  return (
    <aside id="primary-sidebar" className="sidebar" aria-label="Seitenmenü">
      <div className="sidebar-brand">
        <BrandLogo size="medium" />
        <div className="sidebar-brand-copy">
          <strong>WIWEB Berichtsheft</strong>
          <small>Digitaler Ausbildungsnachweis</small>
        </div>
      </div>
      <nav className="sidebar-nav nav flex-column" aria-label="Hauptnavigation">
        {groups.map((group) => (
          <div className="sidebar-nav-group" key={group}>
            <span className="sidebar-group-label">{GROUP_LABELS[group] || group}</span>
            {visibleItems.filter((item) => item.group === group).map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.key === "admin-users"}
                className={({ isActive }) => `sidebar-link nav-link${isActive ? " active" : ""}`}
              >
                <NavigationIcon name={item.key} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      {user ? (
        <div className="sidebar-user" ref={userAreaRef}>
          {userMenuOpen ? (
            <div id="sidebar-user-menu" className="sidebar-user-menu" aria-label="Benutzermenü">
              {!user.passwordChangeRequired ? (
                <NavLink to="/profil" onClick={() => setUserMenuOpen(false)} className={({ isActive }) => `sidebar-user-action${isActive ? " active" : ""}`}>
                  <NavigationIcon name="profile" />
                  <span>Profil</span>
                </NavLink>
              ) : null}
              <div className="sidebar-theme-row">
                <NavLink to="/profil#darstellung" onClick={() => setUserMenuOpen(false)}>Darstellung</NavLink>
                <ThemeSwitch theme={theme} onToggle={onToggleTheme} compact />
              </div>
              <button type="button" className="sidebar-user-action sidebar-logout" onClick={onLogout}>
                <svg className="sidebar-link-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M14 3h7v18h-7" /></svg>
                <span>Abmelden</span>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="sidebar-user-trigger"
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-expanded={userMenuOpen}
            aria-controls="sidebar-user-menu"
          >
            <span className="sidebar-avatar" aria-hidden="true">{initials(user)}</span>
            <span className="sidebar-user-copy">
              <strong>{user.username || user.name || "Benutzer"}</strong>
              <small>{roleLabel(user.role)}</small>
            </span>
            <svg className={`sidebar-user-chevron${userMenuOpen ? " is-open" : ""}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
