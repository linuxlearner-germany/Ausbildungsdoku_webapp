import React from "react";
import { apiClient } from "../lib/api-client";
import { useAppState } from "./AppStateContext";
import { refreshDashboardState } from "./context-helpers";
import { AdminContext } from "./sharedContexts";

export function AdminProvider({ children }) {
  const { dashboard, setDashboard, loginBackground, setLoginBackground } = useAppState();

  async function refreshDashboard() {
    return refreshDashboardState(setDashboard);
  }

  async function createUser(payload) {
    await apiClient.post("/api/admin/users", payload);
    await refreshDashboard();
  }

  async function assignTrainer(traineeId, trainerIds) {
    await apiClient.post("/api/admin/assign-trainer", { traineeId, trainerIds });
    await refreshDashboard();
  }

  async function updateUser(userId, payload) {
    await apiClient.post(`/api/admin/users/${userId}`, payload);
    await refreshDashboard();
  }

  async function deleteUser(userId) {
    const data = await apiClient.delete(`/api/admin/users/${userId}`);
    await refreshDashboard();
    return data;
  }

  async function previewUserImport(payload) {
    return apiClient.post("/api/admin/users/import-preview", payload);
  }

  async function importUsers(payload) {
    const data = await apiClient.post("/api/admin/users/import", payload);
    await refreshDashboard();
    return data;
  }

  async function loadAuditLogs(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    });

    const query = params.toString();
    return apiClient.get(`/api/admin/audit-logs${query ? `?${query}` : ""}`);
  }

  async function loadEmailRelaySettings() {
    return apiClient.get("/api/admin/email-relay");
  }

  async function saveEmailRelaySettings(payload) {
    return apiClient.put("/api/admin/email-relay", payload);
  }

  async function testEmailRelaySettings(payload) {
    return apiClient.post("/api/admin/email-relay/test", payload);
  }

  async function loadLoginBackgroundSettings() {
    const data = await apiClient.get("/api/ui-settings/login-background");
    setLoginBackground(data.background);
    return data;
  }

  async function saveLoginBackgroundSettings(background) {
    const data = await apiClient.put("/api/admin/ui-settings/login-background", { background });
    setLoginBackground(data.background);
    return data;
  }

  async function updateManagedProfile(userId, payload) {
    await apiClient.post(`/api/profile/${userId}`, payload);
    await refreshDashboard();
  }

  return (
    <AdminContext.Provider
      value={{
        dashboard,
        createUser,
        assignTrainer,
        updateUser,
        deleteUser,
        previewUserImport,
        importUsers,
        loadAuditLogs,
        loadEmailRelaySettings,
        saveEmailRelaySettings,
        testEmailRelaySettings,
        loginBackground,
        loadLoginBackgroundSettings,
        saveLoginBackgroundSettings,
        updateManagedProfile
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}
