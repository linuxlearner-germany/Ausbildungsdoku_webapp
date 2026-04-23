import React, { useState } from "react";
import { SidebarNavigation } from "./SidebarNavigation";
import { Topbar } from "./Topbar";

export function AppShell({ user, theme, themePreference, onLogout, onToggleTheme, flash, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <SidebarNavigation user={user} mobileNavOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
      {mobileNavOpen ? <button type="button" className="sidebar-backdrop" aria-label="Navigation schliessen" onClick={() => setMobileNavOpen(false)} /> : null}
      <div className="app-main">
        <Topbar
          user={user}
          theme={theme}
          themePreference={themePreference}
          onLogout={onLogout}
          onToggleTheme={onToggleTheme}
          mobileNavOpen={mobileNavOpen}
          onToggleNavigation={() => setMobileNavOpen((current) => !current)}
        />
        {flash ? <div className={`flash alert ${flash.type === "error" ? "alert-danger" : "alert-success"}`}>{flash.message}</div> : null}
        <main className="page-content container-fluid px-3 px-lg-4">{children}</main>
      </div>
    </div>
  );
}
