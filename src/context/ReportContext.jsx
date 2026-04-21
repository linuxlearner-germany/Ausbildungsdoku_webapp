import React from "react";
import { apiClient } from "../lib/api-client";
import { useAppState } from "./AppStateContext";
import { buildEmptyEntry, getDefaultEntryDate, refreshDashboardState, updateTraineeReport } from "./context-helpers";
import { ReportContext } from "./sharedContexts";

export function ReportProvider({ children }) {
  const { dashboard, setDashboard, setGrades } = useAppState();

  async function refreshDashboard() {
    return refreshDashboardState(setDashboard);
  }

  function getTraineeReport() {
    return dashboard?.role === "trainee" ? dashboard.report : null;
  }

  async function saveTraineeReport(nextReport) {
    const payload = {
      entries: nextReport.entries.map((entry) => ({
        ...entry,
        dateTo: entry.dateFrom || entry.dateTo
      }))
    };
    const data = await apiClient.post("/api/report", payload);
    updateTraineeReport(setDashboard, () => data.data);
    return data.data;
  }

  async function createOrFocusEntry(date) {
    const isoDate = getDefaultEntryDate(date);
    const current = getTraineeReport();
    const existing = current?.entries.find((entry) => entry.dateFrom === isoDate);
    if (existing) {
      return existing.id;
    }

    const data = await apiClient.post("/api/report/draft", buildEmptyEntry(isoDate));
    updateTraineeReport(setDashboard, () => data.data);
    return data.entry?.id || data.data?.entries?.find((entry) => entry.dateFrom === isoDate)?.id || null;
  }

  async function saveEntry(entryId, patch) {
    const current = getTraineeReport();
    if (!current) return null;

    const effectiveId = entryId || patch?.id || "";
    const exists = effectiveId ? current.entries.some((entry) => entry.id === effectiveId) : false;
    const targetId = exists ? effectiveId : await createOrFocusEntry(patch?.dateFrom || "");
    if (!targetId) {
      return null;
    }

    const data = await apiClient.post(`/api/report/entry/${targetId}`, {
      ...patch,
      id: targetId,
      dateTo: patch?.dateFrom || patch?.dateTo
    });
    updateTraineeReport(setDashboard, () => data.data);
    return data.data;
  }

  async function deleteEntry(entryId) {
    const data = await apiClient.delete(`/api/report/${entryId}`);
    updateTraineeReport(setDashboard, (report) => ({
      ...report,
      entries: data.entries
    }));
    return data.entries;
  }

  async function submitEntry(entryId) {
    await apiClient.post("/api/report/submit", { entryId });
    await refreshDashboard();
  }

  async function submitEntries(entryIds) {
    const data = await apiClient.post("/api/report/submit-batch", { entryIds });
    await refreshDashboard();
    return data;
  }

  async function signEntry(entryId, trainerComment) {
    await apiClient.post("/api/trainer/sign", { entryId, trainerComment });
    await refreshDashboard();
  }

  async function rejectEntry(entryId, reason) {
    await apiClient.post("/api/trainer/reject", { entryId, reason });
    await refreshDashboard();
  }

  async function processTrainerEntries(action, entryIds, payload = {}) {
    const data = await apiClient.post("/api/trainer/batch", {
      action,
      entryIds,
      trainerComment: payload.trainerComment || "",
      reason: payload.reason || ""
    });
    await refreshDashboard();
    return data;
  }

  async function saveTrainerComment(entryId, comment) {
    await apiClient.post("/api/trainer/comment", { entryId, comment });
    await refreshDashboard();
  }

  async function previewReportImport(payload) {
    return apiClient.post("/api/report/import-preview", payload);
  }

  async function importReports(payload) {
    const data = await apiClient.post("/api/report/import", payload);
    updateTraineeReport(setDashboard, (report) => ({
      ...report,
      entries: data.entries
    }));
    return data;
  }

  async function clearDerivedState() {
    setGrades([]);
    setDashboard(null);
  }

  return (
    <ReportContext.Provider
      value={{
        dashboard,
        refreshDashboard,
        getTraineeReport,
        saveTraineeReport,
        saveEntry,
        deleteEntry,
        submitEntry,
        submitEntries,
        previewReportImport,
        importReports,
        createOrFocusEntry,
        signEntry,
        rejectEntry,
        processTrainerEntries,
        saveTrainerComment,
        clearDerivedState
      }}
    >
      {children}
    </ReportContext.Provider>
  );
}
