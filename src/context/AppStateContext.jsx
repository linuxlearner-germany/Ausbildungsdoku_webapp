import React, { createContext, useContext, useEffect, useState } from "react";
import { applyThemeAttribute, getSystemPrefersDark, isThemePreference, readStoredThemePreference, resolveTheme, THEME_STORAGE_KEY } from "../lib/theme.mjs";

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const initialThemePreference = readStoredThemePreference(typeof window !== "undefined" ? window.localStorage : null);
  const initialResolvedTheme = resolveTheme(initialThemePreference, getSystemPrefersDark());
  const [session, setSession] = useState({ user: null, ready: false });
  const [dashboard, setDashboard] = useState(null);
  const [grades, setGrades] = useState([]);
  const [themePreference, setThemePreference] = useState(initialThemePreference);
  const [theme, setTheme] = useState(initialResolvedTheme);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  function applyThemePreference(preference) {
    const nextPreference = isThemePreference(preference) ? preference : "system";
    const nextTheme = resolveTheme(nextPreference, getSystemPrefersDark());
    setThemePreference(nextPreference);
    setTheme(nextTheme);
    applyThemeAttribute(nextTheme);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    }
  }

  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  useEffect(() => {
    if (themePreference !== "system" || typeof window === "undefined") {
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const nextTheme = resolveTheme("system", media.matches);
      setTheme(nextTheme);
      applyThemeAttribute(nextTheme);
    };

    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [themePreference]);

  useEffect(() => {
    if (!flash || typeof window === "undefined") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFlash(null);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [flash]);

  return (
    <AppStateContext.Provider
      value={{
        session,
        setSession,
        dashboard,
        setDashboard,
        grades,
        setGrades,
        theme,
        setTheme,
        themePreference,
        setThemePreference,
        busy,
        setBusy,
        flash,
        setFlash,
        applyThemePreference
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error("AppStateContext fehlt.");
  }
  return value;
}
