import { formatLocalDate, getTodayLocalDateString } from "../lib/date.mjs";
import { apiClient } from "../lib/api-client";

export function buildEmptyEntry(date = "") {
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

export function getDefaultEntryDate(date) {
  return date || getTodayLocalDateString();
}

export async function refreshDashboardState(setDashboard) {
  const data = await apiClient.get("/api/dashboard");
  setDashboard(data);
  return data;
}

export async function refreshGradesState(setGrades, traineeId = null) {
  const query = traineeId ? `?traineeId=${encodeURIComponent(traineeId)}` : "";
  const data = await apiClient.get(`/api/grades${query}`);
  setGrades(data.grades);
  return data.grades;
}

export function updateTraineeReport(setDashboard, updater) {
  setDashboard((current) => {
    if (current?.role !== "trainee") {
      return current;
    }

    return {
      ...current,
      report: updater(current.report)
    };
  });
}
