import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AppContext = createContext(null);
const THEME_STORAGE_KEY = "berichtsheft-theme";

function isThemePreference(value) {
  return ["light", "dark", "system"].includes(value);
}

function resolveTheme(preference) {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function buildEmptyEntry(date = "") {
  return {
    id: `entry-${Date.now()}-${Math.random()}`,
    weekLabel: date ? `Tagesbericht ${new Date(date).toLocaleDateString("de-DE")}` : "",
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
  const [session, setSession] = useState({ user: null, ready: false });
  const [dashboard, setDashboard] = useState(null);
  const [grades, setGrades] = useState([]);
  const [themePreference, setThemePreference] = useState("system");
  const [theme, setTheme] = useState("light");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  function applyThemePreference(preference) {
    const nextPreference = isThemePreference(preference) ? preference : "system";
    setThemePreference(nextPreference);
    setTheme(resolveTheme(nextPreference));
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

  async function refreshGrades() {
    const data = await api("/api/grades");
    setGrades(data.grades);
    return data.grades;
  }

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(storedTheme)) {
      applyThemePreference(storedTheme);
    } else {
      applyThemePreference("system");
    }
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (themePreference !== "system") {
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(resolveTheme("system"));
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
    const current = getTraineeReport();
    if (!current) return null;

    const isoDate = date || new Date().toISOString().slice(0, 10);
    const existing = current.entries.find((entry) => entry.dateFrom === isoDate);
    if (existing) {
      return existing.id;
    }

    const nextReport = {
      ...current,
      entries: [buildEmptyEntry(isoDate), ...current.entries]
    };
    const saved = await saveTraineeReport(nextReport);
    return saved.entries.find((entry) => entry.dateFrom === isoDate)?.id || null;
  }

  async function saveEntry(entryId, patch) {
    const current = getTraineeReport();
    if (!current) return;
    const normalizedPatch = {
      ...patch,
      id: entryId,
      dateTo: patch.dateFrom || patch.dateTo
    };
    const exists = current.entries.some((entry) => entry.id === entryId);
    const entries = exists
      ? current.entries.map((entry) =>
          entry.id === entryId ? { ...entry, ...normalizedPatch, dateTo: patch.dateFrom || entry.dateFrom || entry.dateTo } : entry
        )
      : [normalizedPatch, ...current.entries];
    return saveTraineeReport({ ...current, entries });
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

  async function assignTrainer(traineeId, trainerId) {
    await api("/api/admin/assign-trainer", {
      method: "POST",
      body: JSON.stringify({ traineeId, trainerId })
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

  async function updateManagedProfile(userId, payload) {
    await api(`/api/profile/${userId}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await refreshDashboard();
  }

  async function saveThemePreference(nextPreference) {
    applyThemePreference(nextPreference);

    if (!session.user) {
      return nextPreference;
    }

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
        previewReportImport,
        importReports,
        createOrFocusEntry,
        signEntry,
        rejectEntry,
        saveTrainerComment,
        createUser,
        assignTrainer,
        updateUser,
        updateManagedProfile,
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
  return useContext(AppContext);
}
