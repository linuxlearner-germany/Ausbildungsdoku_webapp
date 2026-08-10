import React from "react";
import { getBackground } from "../lib/background.mjs";
import { assetUrl } from "../lib/runtime";
import { SidebarNavigation } from "./SidebarNavigation";

export function AppShell({ user, theme, backgroundPreference, onLogout, onToggleTheme, flash, children }) {
  const background = getBackground(backgroundPreference);
  const hasBackground = Boolean(background.path);

  return (
    <div className={`app-shell${hasBackground ? " has-background" : ""}`}>
      <a className="skip-link" href="#main-content">Zum Hauptinhalt springen</a>
      <SidebarNavigation
        user={user}
        theme={theme}
        onLogout={onLogout}
        onToggleTheme={onToggleTheme}
      />
      <div className="app-main">
        {hasBackground ? (
          <div className="app-background-layer" aria-hidden="true">
            <picture>
              {(background.sources || []).map((source) => (
                <source key={source.minWidth} media={`(min-width: ${source.minWidth}px)`} srcSet={assetUrl(source.path)} />
              ))}
              <img src={assetUrl(background.path)} alt="" style={{ objectPosition: background.position || "center center" }} />
            </picture>
          </div>
        ) : null}
        {flash ? (
          <div
            className={`flash alert ${flash.type === "error" ? "alert-danger" : "alert-success"}`}
            role={flash.type === "error" ? "alert" : "status"}
            aria-live={flash.type === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {flash.message}
          </div>
        ) : null}
        <main id="main-content" tabIndex="-1" className="page-content container-fluid px-3 px-lg-4">
          {children}
        </main>
      </div>
    </div>
  );
}
