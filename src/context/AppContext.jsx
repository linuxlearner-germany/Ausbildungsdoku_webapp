import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AppContext = createContext(null);
const THEME_STORAGE_KEY = "berichtsheft-theme";

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
  const [theme, setTheme] = useState("light");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  async function restoreSession() {
    try {
      const data = await api("/api/session", { headers: {} });
      setSession({ user: data.user, ready: true });
      if (data.user) {
        await refreshDashboard();
        if (data.user.role === "trainee") {
          await refreshGrades();
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
    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
    restoreSession();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!flash) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFlash(null);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [flash]);

  async function login(email, password) {
    setBusy(true);
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setSession({ user: data.user, ready: true });
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
      trainee: nextReport.trainee,
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

  async function updateProfile(trainee) {
    const current = getTraineeReport();
    if (!current) return;
    return saveTraineeReport({ ...current, trainee });
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
    const entries = current.entries.map((entry) =>
      entry.id === entryId ? { ...entry, ...patch, dateTo: patch.dateFrom || entry.dateFrom || entry.dateTo } : entry
    );
    return saveTraineeReport({ ...current, entries });
  }

  async function deleteEntry(entryId) {
    const current = getTraineeReport();
    if (!current) return;
    const entries = current.entries.filter((entry) => entry.id !== entryId);
    return saveTraineeReport({ ...current, entries });
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
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return (
    <AppContext.Provider
      value={{
        session,
        dashboard,
        grades,
        theme,
        busy,
        flash,
        setFlash,
        login,
        logout,
        refreshDashboard,
        getTraineeReport,
        updateProfile,
        saveTraineeReport,
        saveEntry,
        deleteEntry,
        submitEntry,
        createOrFocusEntry,
        signEntry,
        rejectEntry,
        saveTrainerComment,
        createUser,
        assignTrainer,
        updateUser,
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
