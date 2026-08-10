import React, { createContext, useContext } from "react";
import { AppStateProvider, useAppState } from "./AppStateContext";
import { AuthProvider } from "./AuthContext";
import { ReportProvider } from "./ReportContext";
import { AdminProvider } from "./AdminContext";
import { GradesProvider } from "./GradesContext";
import { UiPreferencesProvider } from "./UiPreferencesContext";
import { AuthContext, ReportContext, AdminContext, GradesContext, UiPreferencesContext } from "./sharedContexts";

const AppContext = createContext(null);

function AppContextBridge({ children }) {
  const state = useAppState();
  const auth = useContext(AuthContext);
  const report = useContext(ReportContext);
  const admin = useContext(AdminContext);
  const grades = useContext(GradesContext);
  const ui = useContext(UiPreferencesContext);

  return (
    <AppContext.Provider
      value={{
        session: state.session,
        dashboard: state.dashboard,
        grades: state.grades,
        theme: state.theme,
        themePreference: state.themePreference,
        backgroundPreference: state.backgroundPreference,
        loginBackground: state.loginBackground,
        busy: state.busy,
        flash: state.flash,
        setFlash: state.setFlash,
        ...auth,
        ...report,
        ...admin,
        ...grades,
        ...ui
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function AppProvider({ children }) {
  return (
    <AppStateProvider>
      <AuthProvider>
        <ReportProvider>
          <AdminProvider>
            <GradesProvider>
              <UiPreferencesProvider>
                <AppContextBridge>{children}</AppContextBridge>
              </UiPreferencesProvider>
            </GradesProvider>
          </AdminProvider>
        </ReportProvider>
      </AuthProvider>
    </AppStateProvider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}

export function useAuthContext() {
  return useContext(AuthContext);
}

export function useReportContext() {
  return useContext(ReportContext);
}

export function useAdminContext() {
  return useContext(AdminContext);
}

export function useGradesContext() {
  return useContext(GradesContext);
}

export function useUiPreferencesContext() {
  return useContext(UiPreferencesContext);
}
