import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { formatLocalDate, getTodayLocalDateString } from "../lib/date.mjs";
import { applyThemeAttribute, getSystemPrefersDark, isThemePreference, readStoredThemePreference, resolveTheme, THEME_STORAGE_KEY } from "../lib/theme.mjs";
import { createSeedStore } from "../lib/staticData";
import { AdminContext, AuthContext, ReportContext } from "./sharedContexts";

const STORAGE_KEY = "berichtsheft.github-pages.store.v1";
export const StaticAppContext = createContext(null);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readStore() {
  if (typeof window === "undefined") {
    return createSeedStore();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createSeedStore();
    }

    const parsed = JSON.parse(raw);
    return parsed?.users && parsed?.entries && parsed?.grades ? parsed : createSeedStore();
  } catch (_error) {
    return createSeedStore();
  }
}

function persistStore(store) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return {
    ...safeUser,
    trainerIds: Array.isArray(user.trainerIds) ? user.trainerIds.map(Number) : []
  };
}

function validatePasswordStrength(password) {
  return /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

function nextAuditLog(store, partial) {
  return {
    id: store.nextAuditId,
    createdAt: new Date().toISOString(),
    actorUserId: partial.actorUserId || null,
    actorName: partial.actorName || "System",
    actorRole: partial.actorRole || "system",
    actionType: partial.actionType || "USER_UPDATED",
    entityType: partial.entityType || "system",
    entityId: String(partial.entityId || ""),
    targetUserId: partial.targetUserId ?? null,
    summary: partial.summary || "",
    changes: partial.changes || null,
    metadata: partial.metadata || null
  };
}

function addAuditLog(store, partial) {
  store.auditLogs.unshift(nextAuditLog(store, partial));
  store.nextAuditId += 1;
}

function getUserById(store, userId) {
  return store.users.find((user) => user.id === Number(userId)) || null;
}

function getEntriesForTrainee(store, traineeId) {
  return store.entries
    .filter((entry) => entry.traineeId === Number(traineeId))
    .sort((left, right) => String(right.dateFrom).localeCompare(String(left.dateFrom)));
}

function getGradesForTrainee(store, traineeId) {
  return store.grades
    .filter((grade) => grade.traineeId === Number(traineeId))
    .sort((left, right) => String(right.datum).localeCompare(String(left.datum)) || Number(right.id) - Number(left.id));
}

function canManageTrainee(currentUser, trainee) {
  if (!currentUser || !trainee) return false;
  if (currentUser.role === "admin") return true;
  if (currentUser.role === "trainer") {
    return Array.isArray(trainee.trainerIds) && trainee.trainerIds.includes(currentUser.id);
  }
  return currentUser.id === trainee.id;
}

function buildTraineeRecord(store, trainee) {
  const trainerNames = (trainee.trainerIds || [])
    .map((trainerId) => getUserById(store, trainerId))
    .filter(Boolean)
    .map((trainer) => trainer.name);

  return {
    ...sanitizeUser(trainee),
    trainerNames,
    entries: getEntriesForTrainee(store, trainee.id),
    grades: getGradesForTrainee(store, trainee.id)
  };
}

function buildDashboard(store, currentUser) {
  if (!currentUser) {
    return null;
  }

  if (currentUser.role === "trainee") {
    return {
      role: "trainee",
      report: {
        trainee: sanitizeUser(currentUser),
        entries: getEntriesForTrainee(store, currentUser.id),
        grades: getGradesForTrainee(store, currentUser.id)
      },
      trainees: [],
      users: [],
      educations: store.educations
    };
  }

  const trainees = store.users
    .filter((user) => user.role === "trainee")
    .filter((trainee) => currentUser.role === "admin" || canManageTrainee(currentUser, trainee))
    .map((trainee) => buildTraineeRecord(store, trainee));

  const users = store.users.map((user) => ({
    ...sanitizeUser(user),
    trainerNames: (user.trainerIds || []).map((trainerId) => getUserById(store, trainerId)?.name).filter(Boolean)
  }));

  return {
    role: currentUser.role,
    trainees,
    users,
    educations: clone(store.educations)
  };
}

function parseWorkbookRows(payload) {
  const workbook = XLSX.read(payload.contentBase64, { type: "base64" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
}

function parseDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dotted = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dotted) {
    const [, day, month, year] = dotted;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseReportRows(payload) {
  const rows = parseWorkbookRows(payload);
  return rows.map((row, index) => {
    const dateFrom = parseDateValue(row.dateFrom || row.Datum || row.datum);
    const weekLabel = String(row.weekLabel || row.Titel || row.titel || "").trim();
    const betrieb = String(row.betrieb || row.Betrieb || "").trim();
    const schule = String(row.schule || row.Schule || row.Berufsschule || "").trim();
    const errors = [];

    if (!dateFrom) errors.push("Datum fehlt oder ist ungültig.");
    if (!weekLabel) errors.push("Titel fehlt.");
    if (!betrieb && !schule) errors.push("Betrieb oder Schule muss gefüllt sein.");

    return {
      rowNumber: index + 2,
      dateFrom,
      weekLabel,
      betrieb,
      schule,
      canImport: errors.length === 0,
      errors,
      warnings: []
    };
  });
}

function parseUserRows(payload, store) {
  const knownTrainers = new Map(
    store.users
      .filter((user) => user.role === "trainer")
      .map((trainer) => [trainer.username, trainer])
  );

  return parseWorkbookRows(payload).map((row, index) => {
    const role = String(row.role || row.Rolle || "trainee").trim().toLowerCase();
    const username = normalizeUsername(row.username || row.Benutzername || "");
    const email = String(row.email || row["E-Mail"] || "").trim().toLowerCase();
    const trainerUsernames = String(row.trainerUsernames || row.Ausbilder || "")
      .split(/[|,]/)
      .map((item) => normalizeUsername(item))
      .filter(Boolean);
    const errors = [];
    const warnings = [];

    if (!String(row.name || row.Name || "").trim()) errors.push("Name fehlt.");
    if (!username) errors.push("Benutzername fehlt.");
    if (!email.includes("@")) errors.push("E-Mail fehlt oder ist ungültig.");
    if (!["trainee", "trainer", "admin"].includes(role)) errors.push("Rolle ist ungültig.");
    if (store.users.some((user) => user.username === username)) errors.push("Benutzername existiert bereits.");
    if (store.users.some((user) => user.email === email)) errors.push("E-Mail existiert bereits.");

    const missingTrainers = trainerUsernames.filter((trainerUsername) => !knownTrainers.has(trainerUsername));
    if (missingTrainers.length) {
      warnings.push(`Ausbilder unbekannt: ${missingTrainers.join(", ")}`);
    }

    return {
      rowNumber: index + 2,
      name: String(row.name || row.Name || "").trim(),
      username,
      email,
      password: String(row.password || row.Passwort || "").trim(),
      role,
      ausbildung: String(row.ausbildung || row.Ausbildung || "").trim(),
      betrieb: String(row.betrieb || row.Betrieb || "").trim(),
      berufsschule: String(row.berufsschule || row.Berufsschule || "").trim(),
      trainerUsernames,
      canImport: errors.length === 0,
      errors,
      warnings
    };
  });
}

export function StaticAppProvider({ children }) {
  const initialThemePreference = readStoredThemePreference(typeof window !== "undefined" ? window.localStorage : null);
  const [store, setStore] = useState(() => readStore());
  const [selectedGradesTraineeId, setSelectedGradesTraineeId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [themePreference, setThemePreference] = useState(initialThemePreference);
  const [theme, setTheme] = useState(resolveTheme(initialThemePreference, getSystemPrefersDark()));

  const currentUser = useMemo(() => getUserById(store, store.sessionUserId), [store]);
  const dashboard = useMemo(() => buildDashboard(store, currentUser), [store, currentUser]);
  const grades = useMemo(() => {
    if (!currentUser) return [];
    const targetId = selectedGradesTraineeId || (currentUser.role === "trainee" ? currentUser.id : null);
    return targetId ? getGradesForTrainee(store, targetId) : [];
  }, [currentUser, selectedGradesTraineeId, store]);

  useEffect(() => {
    persistStore(store);
  }, [store]);

  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  useEffect(() => {
    if (currentUser?.themePreference) {
      const nextTheme = resolveTheme(currentUser.themePreference, getSystemPrefersDark());
      setThemePreference(currentUser.themePreference);
      setTheme(nextTheme);
      window.localStorage.setItem(THEME_STORAGE_KEY, currentUser.themePreference);
    }
  }, [currentUser?.themePreference]);

  useEffect(() => {
    if (!flash) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setFlash(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [flash]);

  function commit(mutator) {
    let snapshot = null;
    setStore((current) => {
      const draft = clone(current);
      snapshot = mutator(draft) || draft;
      persistStore(snapshot);
      return snapshot;
    });
    return snapshot;
  }

  function applyThemePreference(preference) {
    const nextPreference = isThemePreference(preference) ? preference : "system";
    const nextTheme = resolveTheme(nextPreference, getSystemPrefersDark());
    setThemePreference(nextPreference);
    setTheme(nextTheme);
    applyThemeAttribute(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
  }

  async function login(identifier, password) {
    setBusy(true);
    try {
      const lookup = String(identifier || "").trim().toLowerCase();
      const user = store.users.find((candidate) => candidate.username === lookup || candidate.email.toLowerCase() === lookup);
      if (!user || user.password !== password) {
        throw new Error("Anmeldung fehlgeschlagen.");
      }

      commit((draft) => {
        draft.sessionUserId = user.id;
      });
      setSelectedGradesTraineeId(user.role === "trainee" ? user.id : null);
      applyThemePreference(user.themePreference || "system");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    commit((draft) => {
      draft.sessionUserId = null;
    });
    setSelectedGradesTraineeId(null);
  }

  async function refreshDashboard() {
    return buildDashboard(store, currentUser);
  }

  async function refreshGrades(traineeId = null) {
    const effectiveId = traineeId || (currentUser?.role === "trainee" ? currentUser.id : null);
    setSelectedGradesTraineeId(effectiveId);
    return effectiveId ? getGradesForTrainee(store, effectiveId) : [];
  }

  function getTraineeReport() {
    return dashboard?.role === "trainee" ? dashboard.report : null;
  }

  async function saveTraineeReport(nextReport) {
    if (!currentUser || currentUser.role !== "trainee") {
      throw new Error("Nur Azubis können Berichte speichern.");
    }

    const nextStore = commit((draft) => {
      draft.entries = draft.entries.filter((entry) => entry.traineeId !== currentUser.id);
      nextReport.entries.forEach((entry) => {
        draft.entries.push({
          ...entry,
          id: entry.id || `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          traineeId: currentUser.id
        });
      });
    });

    return buildDashboard(nextStore, getUserById(nextStore, currentUser.id))?.report || null;
  }

  async function createOrFocusEntry(date) {
    if (!currentUser || currentUser.role !== "trainee") {
      throw new Error("Nur Azubis können Tagesberichte anlegen.");
    }

    const isoDate = date || getTodayLocalDateString();
    const existing = store.entries.find((entry) => entry.traineeId === currentUser.id && entry.dateFrom === isoDate);
    if (existing) {
      return existing.id;
    }

    const nextId = `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    commit((draft) => {
      draft.entries.push({
        ...buildEmptyEntry(isoDate),
        id: nextId,
        traineeId: currentUser.id
      });
    });

    return nextId;
  }

  async function saveEntry(entryId, patch) {
    if (!currentUser || currentUser.role !== "trainee") {
      throw new Error("Nur Azubis können Berichte speichern.");
    }

    let targetId = entryId || patch?.id;
    if (!targetId) {
      targetId = await createOrFocusEntry(patch?.dateFrom || "");
    }

    const nextStore = commit((draft) => {
      const entry = draft.entries.find((candidate) => candidate.id === targetId && candidate.traineeId === currentUser.id);
      if (!entry) {
        throw new Error("Bericht nicht gefunden.");
      }

      if (["submitted", "signed"].includes(entry.status)) {
        throw new Error("Dieser Bericht ist schreibgeschützt.");
      }

      Object.assign(entry, {
        ...patch,
        id: targetId,
        traineeId: currentUser.id,
        dateTo: patch?.dateFrom || patch?.dateTo || entry.dateTo || entry.dateFrom,
        status: patch?.status || entry.status || "draft"
      });
    });

    return buildDashboard(nextStore, getUserById(nextStore, currentUser.id))?.report || null;
  }

  async function deleteEntry(entryId) {
    if (!currentUser || currentUser.role !== "trainee") {
      throw new Error("Nur Azubis können Berichte löschen.");
    }

    const nextStore = commit((draft) => {
      const entry = draft.entries.find((candidate) => candidate.id === entryId && candidate.traineeId === currentUser.id);
      if (!entry || entry.status !== "draft") {
        throw new Error("Nur Entwürfe können gelöscht werden.");
      }

      draft.entries = draft.entries.filter((candidate) => candidate.id !== entryId);
    });

    return getEntriesForTrainee(nextStore, currentUser.id);
  }

  async function submitEntry(entryId) {
    if (!currentUser || currentUser.role !== "trainee") {
      throw new Error("Nur Azubis können Berichte einreichen.");
    }

    commit((draft) => {
      const entry = draft.entries.find((candidate) => candidate.id === entryId && candidate.traineeId === currentUser.id);
      if (!entry) {
        throw new Error("Bericht nicht gefunden.");
      }

      entry.status = "submitted";
      entry.signedAt = null;
      entry.signerName = "";
      addAuditLog(draft, {
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: "REPORT_SUBMITTED",
        entityType: "entry",
        entityId: entry.id,
        targetUserId: currentUser.id,
        summary: `${entry.weekLabel || "Bericht"} wurde eingereicht.`,
        metadata: { traineeName: currentUser.name }
      });
    });
  }

  async function submitEntries(entryIds) {
    let processedCount = 0;
    const failed = [];

    for (const entryId of entryIds || []) {
      try {
        await submitEntry(entryId);
        processedCount += 1;
      } catch (error) {
        failed.push({ entryId, error: error.message });
      }
    }

    return { processedCount, failed };
  }

  function getManagedEntry(entryId) {
    const entry = store.entries.find((candidate) => candidate.id === entryId);
    const trainee = entry ? getUserById(store, entry.traineeId) : null;
    if (!entry || !trainee || !canManageTrainee(currentUser, trainee) || currentUser.role === "trainee") {
      throw new Error("Bericht nicht verfügbar.");
    }
    return { entry, trainee };
  }

  async function signEntry(entryId, trainerComment) {
    const { trainee } = getManagedEntry(entryId);
    commit((draft) => {
      const entry = draft.entries.find((candidate) => candidate.id === entryId);
      entry.status = "signed";
      entry.trainerComment = String(trainerComment || "").trim();
      entry.rejectionReason = "";
      entry.signerName = currentUser.name;
      entry.signedAt = new Date().toISOString();
      addAuditLog(draft, {
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: "REPORT_SIGNED",
        entityType: "entry",
        entityId: entry.id,
        targetUserId: trainee.id,
        summary: `${entry.weekLabel || "Bericht"} wurde freigegeben.`,
        metadata: { traineeName: trainee.name }
      });
    });
  }

  async function rejectEntry(entryId, reason) {
    const { trainee } = getManagedEntry(entryId);
    commit((draft) => {
      const entry = draft.entries.find((candidate) => candidate.id === entryId);
      entry.status = "rejected";
      entry.rejectionReason = String(reason || "").trim();
      entry.trainerComment = "";
      entry.signerName = "";
      entry.signedAt = null;
      addAuditLog(draft, {
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: "REPORT_RETURNED",
        entityType: "entry",
        entityId: entry.id,
        targetUserId: trainee.id,
        summary: `${entry.weekLabel || "Bericht"} wurde zurückgegeben.`,
        metadata: { traineeName: trainee.name }
      });
    });
  }

  async function processTrainerEntries(action, entryIds, payload = {}) {
    let processedCount = 0;
    const failed = [];

    for (const entryId of entryIds || []) {
      try {
        if (action === "sign") {
          await signEntry(entryId, payload.trainerComment);
        } else {
          await rejectEntry(entryId, payload.reason);
        }
        processedCount += 1;
      } catch (error) {
        failed.push({ entryId, error: error.message });
      }
    }

    return { processedCount, failed };
  }

  async function saveTrainerComment(entryId, comment) {
    getManagedEntry(entryId);
    commit((draft) => {
      const entry = draft.entries.find((candidate) => candidate.id === entryId);
      entry.trainerComment = String(comment || "").trim();
    });
  }

  async function previewReportImport(payload) {
    const rows = parseReportRows(payload);
    return {
      rows,
      mapping: {
        dateFrom: "Datum",
        weekLabel: "Titel",
        betrieb: "Betrieb",
        schule: "Schule"
      },
      summary: {
        totalRows: rows.length,
        validRows: rows.filter((row) => row.canImport).length,
        invalidRows: rows.filter((row) => !row.canImport).length
      }
    };
  }

  async function importReports(payload) {
    if (!currentUser || currentUser.role !== "trainee") {
      throw new Error("Nur Azubis können Berichte importieren.");
    }

    const rows = parseReportRows(payload).filter((row) => row.canImport);
    const nextStore = commit((draft) => {
      rows.forEach((row) => {
        const existing = draft.entries.find((entry) => entry.traineeId === currentUser.id && entry.dateFrom === row.dateFrom);
        if (existing) {
          Object.assign(existing, {
            weekLabel: row.weekLabel,
            betrieb: row.betrieb,
            schule: row.schule,
            status: existing.status === "signed" ? "signed" : "draft"
          });
          return;
        }

        draft.entries.push({
          id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          traineeId: currentUser.id,
          weekLabel: row.weekLabel,
          dateFrom: row.dateFrom,
          dateTo: row.dateFrom,
          betrieb: row.betrieb,
          schule: row.schule,
          status: "draft",
          signedAt: null,
          signerName: "",
          trainerComment: "",
          rejectionReason: ""
        });
      });
    });

    return {
      importedCount: rows.length,
      entries: getEntriesForTrainee(nextStore, currentUser.id)
    };
  }

  async function createUser(payload) {
    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Nur Admins können Benutzer anlegen.");
    }

    const username = normalizeUsername(payload.username);
    const email = String(payload.email || "").trim().toLowerCase();
    if (!payload.name?.trim() || !username || !email.includes("@")) {
      throw new Error("Name, Benutzername und E-Mail sind Pflichtfelder.");
    }
    if (store.users.some((user) => user.username === username)) {
      throw new Error("Benutzername existiert bereits.");
    }
    if (store.users.some((user) => user.email === email)) {
      throw new Error("E-Mail existiert bereits.");
    }

    const password = String(payload.password || "").trim() || "Start!12345";
    commit((draft) => {
      const newUser = {
        id: draft.nextUserId,
        name: String(payload.name || "").trim(),
        username,
        email,
        password,
        role: payload.role || "trainee",
        ausbildung: String(payload.ausbildung || "").trim(),
        betrieb: String(payload.betrieb || "").trim(),
        berufsschule: String(payload.berufsschule || "").trim(),
        trainerIds: payload.role === "trainee" ? (payload.trainerIds || []).map(Number) : [],
        themePreference: "system"
      };
      draft.users.push(newUser);
      draft.nextUserId += 1;

      if (newUser.ausbildung && !draft.educations.some((education) => education.name === newUser.ausbildung)) {
        draft.educations.push({ id: draft.educations.length + 1, name: newUser.ausbildung });
      }

      addAuditLog(draft, {
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: "USER_CREATED",
        entityType: "user",
        entityId: String(newUser.id),
        targetUserId: newUser.id,
        summary: `${newUser.name} wurde angelegt.`,
        metadata: { username: newUser.username, role: newUser.role }
      });
    });
  }

  async function assignTrainer(traineeId, trainerIds) {
    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Nur Admins können Ausbilder zuweisen.");
    }

    commit((draft) => {
      const trainee = draft.users.find((user) => user.id === Number(traineeId) && user.role === "trainee");
      if (!trainee) throw new Error("Azubi nicht gefunden.");
      trainee.trainerIds = (trainerIds || []).map(Number);
      addAuditLog(draft, {
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: "TRAINER_ASSIGNED",
        entityType: "user",
        entityId: String(trainee.id),
        targetUserId: trainee.id,
        summary: `Ausbilder für ${trainee.name} wurden aktualisiert.`,
        metadata: { traineeName: trainee.name }
      });
    });
  }

  async function updateUser(userId, payload) {
    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Nur Admins können Benutzer bearbeiten.");
    }

    commit((draft) => {
      const user = draft.users.find((candidate) => candidate.id === Number(userId));
      if (!user) throw new Error("Benutzer nicht gefunden.");

      const nextUsername = normalizeUsername(payload.username || user.username);
      const nextEmail = String(payload.email || user.email).trim().toLowerCase();
      if (draft.users.some((candidate) => candidate.id !== user.id && candidate.username === nextUsername)) {
        throw new Error("Benutzername existiert bereits.");
      }
      if (draft.users.some((candidate) => candidate.id !== user.id && candidate.email === nextEmail)) {
        throw new Error("E-Mail existiert bereits.");
      }

      Object.assign(user, {
        name: String(payload.name || "").trim(),
        username: nextUsername,
        email: nextEmail,
        role: payload.role || user.role,
        ausbildung: String(payload.ausbildung || "").trim(),
        betrieb: String(payload.betrieb || "").trim(),
        berufsschule: String(payload.berufsschule || "").trim(),
        trainerIds: (payload.role || user.role) === "trainee" ? (payload.trainerIds || []).map(Number) : []
      });

      if (payload.password?.trim()) {
        user.password = payload.password.trim();
      }

      addAuditLog(draft, {
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: "USER_UPDATED",
        entityType: "user",
        entityId: String(user.id),
        targetUserId: user.id,
        summary: `${user.name} wurde aktualisiert.`,
        metadata: { username: user.username, role: user.role }
      });
    });
  }

  async function deleteUser(userId) {
    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Nur Admins können Benutzer löschen.");
    }

    const deletedUser = getUserById(store, userId);
    if (!deletedUser) {
      throw new Error("Benutzer nicht gefunden.");
    }

    commit((draft) => {
      draft.users = draft.users.filter((user) => user.id !== Number(userId));
      draft.entries = draft.entries.filter((entry) => entry.traineeId !== Number(userId));
      draft.grades = draft.grades.filter((grade) => grade.traineeId !== Number(userId));
      draft.users.forEach((user) => {
        user.trainerIds = (user.trainerIds || []).filter((trainerId) => trainerId !== Number(userId));
      });
      addAuditLog(draft, {
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: "USER_DELETED",
        entityType: "user",
        entityId: String(userId),
        targetUserId: Number(userId),
        summary: `${deletedUser.name} wurde gelöscht.`,
        metadata: { username: deletedUser.username, role: deletedUser.role }
      });
    });

    return { deletedUser: sanitizeUser(deletedUser) };
  }

  async function previewUserImport(payload) {
    const rows = parseUserRows(payload, store);
    return {
      rows,
      summary: {
        totalRows: rows.length,
        validRows: rows.filter((row) => row.canImport).length,
        invalidRows: rows.filter((row) => !row.canImport).length
      }
    };
  }

  async function importUsers(payload) {
    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Nur Admins können Benutzer importieren.");
    }

    const rows = parseUserRows(payload, store).filter((row) => row.canImport);
    const generatedCredentials = [];

    commit((draft) => {
      rows.forEach((row) => {
        const generatedPassword = row.password || `Start!${Math.random().toString(36).slice(2, 8)}A1`;
        if (!row.password) {
          generatedCredentials.push({ username: row.username, generatedPassword });
        }

        const trainerIds = row.role === "trainee"
          ? row.trainerUsernames
              .map((trainerUsername) => draft.users.find((user) => user.username === trainerUsername && user.role === "trainer")?.id)
              .filter(Boolean)
          : [];

        draft.users.push({
          id: draft.nextUserId,
          name: row.name,
          username: row.username,
          email: row.email,
          password: generatedPassword,
          role: row.role,
          ausbildung: row.ausbildung,
          betrieb: row.betrieb,
          berufsschule: row.berufsschule,
          trainerIds,
          themePreference: "system"
        });
        draft.nextUserId += 1;

        if (row.ausbildung && !draft.educations.some((education) => education.name === row.ausbildung)) {
          draft.educations.push({ id: draft.educations.length + 1, name: row.ausbildung });
        }
      });

      addAuditLog(draft, {
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: "CSV_IMPORT_EXECUTED",
        entityType: "user_import",
        entityId: `import-${Date.now()}`,
        targetUserId: null,
        summary: `${rows.length} Nutzer wurden importiert.`,
        metadata: { importedCount: rows.length }
      });
    });

    return {
      importedCount: rows.length,
      generatedCredentials
    };
  }

  async function loadAuditLogs(filters = {}) {
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.max(1, Number(filters.pageSize || 20));
    const search = String(filters.search || "").trim().toLowerCase();

    const items = store.auditLogs.filter((log) => {
      const matchesAction = !filters.actionType || log.actionType === filters.actionType;
      const matchesUser = !filters.userId || String(log.targetUserId || log.actorUserId || "") === String(filters.userId);
      const matchesFrom = !filters.from || String(log.createdAt).slice(0, 10) >= filters.from;
      const matchesTo = !filters.to || String(log.createdAt).slice(0, 10) <= filters.to;
      const haystack = [log.actorName, log.summary, log.actionType, JSON.stringify(log.metadata || {})].join(" ").toLowerCase();
      const matchesSearch = !search || haystack.includes(search);
      return matchesAction && matchesUser && matchesFrom && matchesTo && matchesSearch;
    });

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages
      }
    };
  }

  async function updateManagedProfile(userId, payload) {
    const managedUser = getUserById(store, userId);
    if (!managedUser || managedUser.role !== "trainee" || !canManageTrainee(currentUser, managedUser) || currentUser.role === "trainee") {
      throw new Error("Profil nicht verfügbar.");
    }

    commit((draft) => {
      const user = draft.users.find((candidate) => candidate.id === Number(userId));
      Object.assign(user, {
        name: String(payload.name || "").trim(),
        ausbildung: String(payload.ausbildung || "").trim(),
        betrieb: String(payload.betrieb || "").trim(),
        berufsschule: String(payload.berufsschule || "").trim()
      });
      addAuditLog(draft, {
        actorUserId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: "PROFILE_UPDATED_BY_ADMIN",
        entityType: "user",
        entityId: String(user.id),
        targetUserId: user.id,
        summary: `Profildaten von ${user.name} wurden angepasst.`,
        metadata: { traineeName: user.name }
      });
    });
  }

  async function saveThemePreference(nextPreference) {
    applyThemePreference(nextPreference);
    if (!currentUser) {
      return nextPreference;
    }

    commit((draft) => {
      const user = draft.users.find((candidate) => candidate.id === currentUser.id);
      user.themePreference = nextPreference;
    });
    return nextPreference;
  }

  async function changeOwnPassword(payload) {
    if (!currentUser) {
      throw new Error("Nicht angemeldet.");
    }

    const currentPassword = String(payload?.currentPassword || "");
    const newPassword = String(payload?.newPassword || "");
    const repeat = String(payload?.newPasswordRepeat || "");

    if (currentPassword !== currentUser.password) {
      throw new Error("Aktuelles Passwort ist nicht korrekt.");
    }
    if (newPassword.length < 10) {
      throw new Error("Das neue Passwort muss mindestens 10 Zeichen lang sein.");
    }
    if (!validatePasswordStrength(newPassword)) {
      throw new Error("Das neue Passwort erfüllt die Regeln nicht.");
    }
    if (newPassword !== repeat) {
      throw new Error("Neues Passwort und Wiederholung stimmen nicht überein.");
    }
    if (newPassword === currentPassword) {
      throw new Error("Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.");
    }

    commit((draft) => {
      const user = draft.users.find((candidate) => candidate.id === currentUser.id);
      user.password = newPassword;
    });

    return { success: true };
  }

  async function saveGrade(payload) {
    if (!currentUser || !["trainee", "admin"].includes(currentUser.role)) {
      throw new Error("Noten können hier nicht bearbeitet werden.");
    }

    const targetTraineeId = Number(payload.traineeId || currentUser.id);
    if (currentUser.role === "trainee" && targetTraineeId !== currentUser.id) {
      throw new Error("Unzulässige Aktion.");
    }

    const nextStore = commit((draft) => {
      const existing = payload.id ? draft.grades.find((grade) => grade.id === Number(payload.id)) : null;
      const nextPayload = {
        traineeId: targetTraineeId,
        fach: String(payload.fach || "").trim(),
        typ: String(payload.typ || "Schulaufgabe"),
        bezeichnung: String(payload.bezeichnung || "").trim(),
        datum: String(payload.datum || ""),
        note: Number(payload.note),
        gewicht: Number(payload.gewicht || 1)
      };

      if (existing) {
        Object.assign(existing, nextPayload);
      } else {
        draft.grades.push({
          id: draft.nextGradeId,
          ...nextPayload
        });
        draft.nextGradeId += 1;
      }
    });

    setSelectedGradesTraineeId(targetTraineeId);
    return getGradesForTrainee(nextStore, targetTraineeId);
  }

  async function deleteGrade(gradeId) {
    const currentStore = readStore();
    const grade = currentStore.grades.find((candidate) => candidate.id === Number(gradeId));
    if (!grade) {
      throw new Error("Note nicht gefunden.");
    }

    if (!currentUser || (currentUser.role === "trainee" && grade.traineeId !== currentUser.id) || currentUser.role === "trainer") {
      throw new Error("Note kann nicht gelöscht werden.");
    }

    const nextStore = commit((draft) => {
      draft.grades = draft.grades.filter((candidate) => candidate.id !== Number(gradeId));
    });

    setSelectedGradesTraineeId(grade.traineeId);
    return getGradesForTrainee(nextStore, grade.traineeId);
  }

  function toggleTheme() {
    const nextPreference = theme === "dark" ? "light" : "dark";
    return saveThemePreference(nextPreference);
  }

  const authValue = {
    session: { user: sanitizeUser(currentUser), ready: true },
    busy,
    login,
    logout,
    changeOwnPassword
  };

  const reportValue = {
    dashboard,
    grades,
    refreshDashboard,
    refreshGrades,
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
    saveGrade,
    deleteGrade
  };

  const adminValue = {
    dashboard,
    createUser,
    assignTrainer,
    updateUser,
    deleteUser,
    previewUserImport,
    importUsers,
    loadAuditLogs,
    updateManagedProfile
  };

  return (
    <StaticAppContext.Provider
      value={{
        session: { user: sanitizeUser(currentUser), ready: true },
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
      <AuthContext.Provider value={authValue}>
        <ReportContext.Provider value={reportValue}>
          <AdminContext.Provider value={adminValue}>
            {children}
          </AdminContext.Provider>
        </ReportContext.Provider>
      </AuthContext.Provider>
    </StaticAppContext.Provider>
  );
}

export function useStaticAppContext() {
  return useContext(StaticAppContext);
}
