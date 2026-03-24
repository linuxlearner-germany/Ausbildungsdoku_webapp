import React, { useState } from "react";
import { SidebarNavigation } from "./SidebarNavigation";
import { Topbar } from "./Topbar";

export function AppShell({ user, theme, themePreference, onLogout, onToggleTheme, flash, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <SidebarNavigation user={user} mobileNavOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
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
        {flash ? <div className={`flash flash-${flash.type}`}>{flash.message}</div> : null}
        <div className="page-content">{children}</div>
      </div>
    </div>
  );
}
