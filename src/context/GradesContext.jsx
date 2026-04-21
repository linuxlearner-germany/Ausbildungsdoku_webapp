import React from "react";
import { apiClient } from "../lib/api-client";
import { useAppState } from "./AppStateContext";
import { refreshGradesState, updateTraineeReport } from "./context-helpers";
import { GradesContext } from "./sharedContexts";

export function GradesProvider({ children }) {
  const { grades, setGrades, setDashboard } = useAppState();

  async function refreshGrades(traineeId = null) {
    return refreshGradesState(setGrades, traineeId);
  }

  async function saveGrade(payload) {
    const data = await apiClient.post("/api/grades", payload);
    setGrades(data.grades);
    updateTraineeReport(setDashboard, (report) => ({
      ...report,
      grades: data.grades
    }));
    return data.grades;
  }

  async function deleteGrade(gradeId) {
    const data = await apiClient.delete(`/api/grades/${gradeId}`);
    setGrades(data.grades);
    updateTraineeReport(setDashboard, (report) => ({
      ...report,
      grades: data.grades
    }));
    return data.grades;
  }

  return (
    <GradesContext.Provider
      value={{
        grades,
        refreshGrades,
        saveGrade,
        deleteGrade
      }}
    >
      {children}
    </GradesContext.Provider>
  );
}
