import React, { useEffect } from "react";
import { apiClient } from "../lib/api-client";
import { THEME_STORAGE_KEY } from "../lib/theme.mjs";
import { useAppState } from "./AppStateContext";
import { refreshDashboardState, refreshGradesState } from "./context-helpers";
import { AuthContext } from "./sharedContexts";

export function AuthProvider({ children }) {
  const {
    session,
    setSession,
    setDashboard,
    setGrades,
    setBusy,
    busy,
    applyThemePreference,
    setFlash
  } = useAppState();

  async function restoreSession() {
    try {
      const data = await apiClient.get("/api/session", { headers: {} });
      setSession({ user: data.user, ready: true });

      if (data.user?.themePreference) {
        applyThemePreference(data.user.themePreference);
      }

      if (data.user) {
        await refreshDashboardState(setDashboard);
        if (data.user.role === "trainee") {
          await refreshGradesState(setGrades);
        }
      }
    } catch (error) {
      setFlash({ type: "error", message: error.message });
      setSession({ user: null, ready: true });
    }
  }

  useEffect(() => {
    restoreSession();
  }, []);

  async function login(identifier, password) {
    setBusy(true);

    try {
      const data = await apiClient.post("/api/login", { identifier, password });
      setSession({ user: data.user, ready: true });
      applyThemePreference(data.user?.themePreference || window.localStorage.getItem(THEME_STORAGE_KEY) || "system");
      await refreshDashboardState(setDashboard);

      if (data.user.role === "trainee") {
        await refreshGradesState(setGrades);
      } else {
        setGrades([]);
      }

      setFlash(null);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await apiClient.post("/api/logout");
    setSession({ user: null, ready: true });
    setDashboard(null);
    setGrades([]);
  }

  async function changeOwnPassword(payload) {
    const safePayload = {
      currentPassword: String(payload?.currentPassword || ""),
      newPassword: String(payload?.newPassword || ""),
      newPasswordRepeat: String(payload?.newPasswordRepeat || "")
    };

    return apiClient.post("/api/profile/password", safePayload);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        busy,
        login,
        logout,
        changeOwnPassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
