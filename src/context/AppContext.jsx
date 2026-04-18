import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatLocalDate, getTodayLocalDateString } from "../lib/date.mjs";
import { applyThemeAttribute, getSystemPrefersDark, isThemePreference, readStoredThemePreference, resolveTheme, THEME_STORAGE_KEY } from "../lib/theme.mjs";
import { StaticAppContext } from "./StaticAppContext";

const AppContext = createContext(null);

function buildEmptyEntry(date = "") {
  return {
    id: "",
    weekLabel: date ? `Tagesbericht ${formatLocalDate(date)}` : "",
    dateFrom: date,
    dateTo: date,
    betrieb: "",
    schule: "",
    status: "draft",
    signedAt: null,
    signerName: "",
    trainerComment: "",
    rejectionReason: ""
  };
}

export function AppProvider({ children }) {
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
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  }

  async function restoreSession() {
    try {
      const data = await api("/api/session", { headers: {} });
      setSession({ user: data.user, ready: true });
      if (data.user?.themePreference) {
        applyThemePreference(data.user.themePreference);
      }
      if (data.user) {
        try {
          await refreshDashboard();
          if (data.user.role === "trainee") {
            await refreshGrades();
          }
        } catch (error) {
          setFlash({ type: "error", message: error.message });
        }
      }
    } catch (error) {
      setFlash({ type: "error", message: error.message });
      setSession({ user: null, ready: true });
    }
  }

  async function refreshDashboard() {
    const data = await api("/api/dashboard");
    setDashboard(data);
    return data;
  }

  async function refreshGrades(traineeId = null) {
    const query = traineeId ? `?traineeId=${encodeURIComponent(traineeId)}` : "";
    const data = await api(`/api/grades${query}`);
    setGrades(data.grades);
    return data.grades;
  }

  useEffect(() => {
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  useEffect(() => {
    if (themePreference !== "system") {
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
    if (!flash) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFlash(null);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [flash]);

  async function login(identifier, password) {
    setBusy(true);
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password })
      });
      setSession({ user: data.user, ready: true });
      applyThemePreference(data.user?.themePreference || window.localStorage.getItem(THEME_STORAGE_KEY) || "system");
      await refreshDashboard();
      if (data.user.role === "trainee") {
        await refreshGrades();
      } else {
        setGrades([]);
      }
      setFlash(null);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" });
    setSession({ user: null, ready: true });
    setDashboard(null);
    setGrades([]);
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
    const data = await api("/api/report", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setDashboard((current) => ({ ...current, report: data.data }));
    return data.data;
  }

  async function createOrFocusEntry(date) {
    const isoDate = date || getTodayLocalDateString();
    const current = getTraineeReport();
    const existing = current?.entries.find((entry) => entry.dateFrom === isoDate);
    if (existing) {
      return existing.id;
    }

    const data = await api("/api/report/draft", {
      method: "POST",
      body: JSON.stringify(buildEmptyEntry(isoDate))
    });
    setDashboard((dashboard) => (dashboard?.role === "trainee" ? { ...dashboard, report: data.data } : dashboard));
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

    const data = await api(`/api/report/entry/${targetId}`, {
      method: "POST",
      body: JSON.stringify({
        ...patch,
        id: targetId,
        dateTo: patch?.dateFrom || patch?.dateTo
      })
    });
    setDashboard((dashboard) => (dashboard?.role === "trainee" ? { ...dashboard, report: data.data } : dashboard));
    return data.data;
  }

  async function deleteEntry(entryId) {
    const data = await api(`/api/report/${entryId}`, {
      method: "DELETE"
    });
    setDashboard((current) =>
      current?.role === "trainee"
        ? {
            ...current,
            report: {
              ...current.report,
              entries: data.entries
            }
          }
        : current
    );
    return data.entries;
  }

  async function submitEntry(entryId) {
    await api("/api/report/submit", {
      method: "POST",
      body: JSON.stringify({ entryId })
    });
    await refreshDashboard();
  }

  async function submitEntries(entryIds) {
    const data = await api("/api/report/submit-batch", {
      method: "POST",
      body: JSON.stringify({ entryIds })
    });
    await refreshDashboard();
    return data;
  }

  async function signEntry(entryId, trainerComment) {
    await api("/api/trainer/sign", {
      method: "POST",
      body: JSON.stringify({ entryId, trainerComment })
    });
    await refreshDashboard();
  }

  async function rejectEntry(entryId, reason) {
    await api("/api/trainer/reject", {
      method: "POST",
      body: JSON.stringify({ entryId, reason })
    });
    await refreshDashboard();
  }

  async function processTrainerEntries(action, entryIds, payload = {}) {
    const data = await api("/api/trainer/batch", {
      method: "POST",
      body: JSON.stringify({
        action,
        entryIds,
        trainerComment: payload.trainerComment || "",
        reason: payload.reason || ""
      })
    });
    await refreshDashboard();
    return data;
  }

  async function saveTrainerComment(entryId, comment) {
    await api("/api/trainer/comment", {
      method: "POST",
      body: JSON.stringify({ entryId, comment })
    });
    await refreshDashboard();
  }

  async function previewReportImport(payload) {
    return api("/api/report/import-preview", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function importReports(payload) {
    const data = await api("/api/report/import", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setDashboard((current) =>
      current?.role === "trainee"
        ? {
            ...current,
            report: {
              ...current.report,
              entries: data.entries
            }
          }
        : current
    );

    return data;
  }

  async function createUser(payload) {
    await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await refreshDashboard();
  }

  async function assignTrainer(traineeId, trainerIds) {
    await api("/api/admin/assign-trainer", {
      method: "POST",
      body: JSON.stringify({ traineeId, trainerIds })
    });
    await refreshDashboard();
  }

  async function updateUser(userId, payload) {
    await api(`/api/admin/users/${userId}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await refreshDashboard();
  }

  async function deleteUser(userId) {
    const data = await api(`/api/admin/users/${userId}`, {
      method: "DELETE"
    });
    await refreshDashboard();
    return data;
  }

  async function previewUserImport(payload) {
    return api("/api/admin/users/import-preview", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function importUsers(payload) {
    const data = await api("/api/admin/users/import", {
      method: "POST",
      body: JSON.stringify(payload)
    });
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
    return api(`/api/admin/audit-logs${query ? `?${query}` : ""}`);
  }

  async function updateManagedProfile(userId, payload) {
    await api(`/api/profile/${userId}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await refreshDashboard();
  }

  async function saveThemePreference(nextPreference) {
    const previousPreference = themePreference;
    const previousTheme = theme;
    applyThemePreference(nextPreference);

    if (!session.user) {
      return nextPreference;
    }

    try {
      const data = await api("/api/preferences/theme", {
        method: "POST",
        body: JSON.stringify({ themePreference: nextPreference })
      });

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

  async function changeOwnPassword(payload) {
    const safePayload = {
      currentPassword: String(payload?.currentPassword || ""),
      newPassword: String(payload?.newPassword || ""),
      newPasswordRepeat: String(payload?.newPasswordRepeat || "")
    };

    return api("/api/profile/password", {
      method: "POST",
      body: JSON.stringify(safePayload)
    });
  }

  async function saveGrade(payload) {
    const data = await api("/api/grades", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setGrades(data.grades);
    setDashboard((current) =>
      current?.role === "trainee"
        ? {
            ...current,
            report: {
              ...current.report,
              grades: data.grades
            }
          }
        : current
    );
    return data.grades;
  }

  async function deleteGrade(gradeId) {
    const data = await api(`/api/grades/${gradeId}`, {
      method: "DELETE"
    });
    setGrades(data.grades);
    setDashboard((current) =>
      current?.role === "trainee"
        ? {
            ...current,
            report: {
              ...current.report,
              grades: data.grades
            }
          }
        : current
    );
    return data.grades;
  }

  function toggleTheme() {
    const nextPreference = theme === "dark" ? "light" : "dark";
    return saveThemePreference(nextPreference);
  }

  return (
    <AppContext.Provider
      value={{
        session,
        dashboard,
        grades,
        theme,
        themePreference,
        busy,
        flash,
        setFlash,
        login,
        logout,
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
        createUser,
        assignTrainer,
        updateUser,
        deleteUser,
        previewUserImport,
        importUsers,
        loadAuditLogs,
        updateManagedProfile,
        changeOwnPassword,
        saveThemePreference,
        refreshGrades,
        saveGrade,
        deleteGrade,
        toggleTheme
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext) || useContext(StaticAppContext);
}
