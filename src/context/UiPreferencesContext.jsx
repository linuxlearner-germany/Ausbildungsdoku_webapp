import React from "react";
import { apiClient } from "../lib/api-client";
import { applyThemeAttribute, THEME_STORAGE_KEY } from "../lib/theme.mjs";
import { saveStoredBackgroundPreference } from "../lib/background.mjs";
import { useAppState } from "./AppStateContext";
import { UiPreferencesContext } from "./sharedContexts";

export function UiPreferencesProvider({ children }) {
  const {
    session,
    setSession,
    theme,
    setTheme,
    themePreference,
    setThemePreference,
    backgroundPreference,
    setBackgroundPreference,
    applyThemePreference
  } = useAppState();

  async function saveThemePreference(nextPreference) {
    const previousPreference = themePreference;
    const previousTheme = theme;
    applyThemePreference(nextPreference);

    if (!session.user) {
      return nextPreference;
    }

    try {
      const data = await apiClient.post("/api/preferences/theme", { themePreference: nextPreference });
      setSession((current) =>
        current.user
          ? {
              ...current,
              user: {
                ...current.user,
                themePreference: data.themePreference
              }
            }
          : current
      );

      return data.themePreference;
    } catch (error) {
      setThemePreference(previousPreference);
      setTheme(previousTheme);
      applyThemeAttribute(previousTheme);
      window.localStorage.setItem(THEME_STORAGE_KEY, previousPreference);
      throw error;
    }
  }

  function toggleTheme() {
    const nextPreference = theme === "dark" ? "light" : "dark";
    return saveThemePreference(nextPreference);
  }

  function saveBackgroundPreference(nextBackground) {
    const preference = saveStoredBackgroundPreference(
      typeof window !== "undefined" ? window.localStorage : null,
      nextBackground
    );
    setBackgroundPreference(preference);
    return preference;
  }

  return (
    <UiPreferencesContext.Provider
      value={{
        theme,
        themePreference,
        backgroundPreference,
        saveThemePreference,
        saveBackgroundPreference,
        toggleTheme
      }}
    >
      {children}
    </UiPreferencesContext.Provider>
  );
}
