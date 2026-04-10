import React from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppProvider, useAppContext } from "./context/AppContext";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TagesberichtePage } from "./pages/TagesberichtePage";
import { FreigabenPage } from "./pages/FreigabenPage";
import { ProfilPage } from "./pages/ProfilPage";
import { ArchivPage } from "./pages/ArchivPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { NotenPage } from "./pages/NotenPage";
import { ExportPage } from "./pages/ExportPage";

function ProtectedApp() {
  const navigate = useNavigate();
  const {
    session,
    dashboard,
    grades,
    theme,
    themePreference,
    flash,
    setFlash,
    logout,
    getTraineeReport,
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
  } = useAppContext();

  if (!session.user) {
    return <LoginPage />;
  }

  const role = dashboard?.role || session.user.role;
  const report = getTraineeReport();
  const trainees = dashboard?.trainees || [];
  const users = dashboard?.users || [];
  const educations = dashboard?.educations || [];

  return (
    <AppShell
      user={session.user}
      theme={theme}
      themePreference={themePreference}
      flash={flash}
      onLogout={logout}
      onToggleTheme={async () => {
        await toggleTheme();
        setFlash({ type: "success", message: `Darstellung auf ${theme === "dark" ? "hell" : "dunkel"} umgestellt.` });
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage role={role} report={report} trainees={trainees} users={users} />} />
        <Route
          path="/berichte"
          element={
            role === "trainee" ? (
              <TagesberichtePage
                report={report}
                initialView="calendar"
                onCreate={async (date) => {
                  const id = await createOrFocusEntry(date);
                  setFlash({ type: "success", message: `Tagesbericht für ${date || "heute"} geöffnet.` });
                  return id;
                }}
                onSaveEntry={async (entryId, entry) => {
                  await saveEntry(entryId, entry);
                  setFlash({ type: "success", message: "Tagesbericht gespeichert." });
                }}
                onDeleteEntry={async (entryId) => {
                  await deleteEntry(entryId);
                  setFlash({ type: "success", message: "Tagesbericht gelöscht." });
                  navigate("/berichte", { replace: true });
                }}
                onSubmitEntry={async (entryId) => {
                  await submitEntry(entryId);
                  setFlash({ type: "success", message: "Tagesbericht eingereicht." });
                }}
                onSubmitEntries={async (entryIds) => {
                  const data = await submitEntries(entryIds);
                  setFlash({
                    type: data.failed?.length ? "error" : "success",
                    message: data.failed?.length
                      ? `${data.processedCount} Berichte eingereicht, ${data.failed.length} nicht verarbeitet.`
                      : `${data.processedCount} Berichte eingereicht.`
                  });
                  return data;
                }}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route path="/tagesberichte" element={<Navigate to="/berichte?view=write" replace />} />
        <Route path="/kalender" element={<Navigate to="/berichte?view=calendar" replace />} />
        <Route
          path="/freigaben"
          element={
            <FreigabenPage
              role={role}
              report={report}
              trainees={trainees}
              onSign={async (entryId, comment) => {
                await signEntry(entryId, comment);
                setFlash({ type: "success", message: "Bericht freigegeben." });
              }}
              onReject={async (entryId, reason) => {
                await rejectEntry(entryId, reason);
                setFlash({ type: "success", message: "Bericht abgelehnt." });
              }}
              onProcessEntries={async (action, entryIds, payload) => {
                const data = await processTrainerEntries(action, entryIds, payload);
                setFlash({
                  type: data.failed?.length ? "error" : "success",
                  message:
                    action === "sign"
                      ? data.failed?.length
                        ? `${data.processedCount} Berichte freigegeben, ${data.failed.length} nicht verarbeitet.`
                        : `${data.processedCount} Berichte freigegeben.`
                      : data.failed?.length
                        ? `${data.processedCount} Berichte zurückgegeben, ${data.failed.length} nicht verarbeitet.`
                        : `${data.processedCount} Berichte zurückgegeben.`
                });
                return data;
              }}
              onComment={async (entryId, comment) => {
                await saveTrainerComment(entryId, comment);
                setFlash({ type: "success", message: "Kommentar gespeichert." });
              }}
            />
          }
        />
        <Route
          path="/noten"
          element={
            ["trainee", "trainer", "admin"].includes(role) ? (
              <NotenPage
                role={role}
                grades={grades}
                report={report}
                currentUser={session.user}
                trainees={trainees}
                users={users}
                onLoadGrades={refreshGrades}
                onSaveGrade={async (payload) => {
                  await saveGrade(payload);
                  setFlash({ type: "success", message: "Note gespeichert." });
                }}
                onDeleteGrade={async (gradeId) => {
                  await deleteGrade(gradeId);
                  setFlash({ type: "success", message: "Note gelöscht." });
                }}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/profil"
          element={
            ["trainee", "trainer", "admin"].includes(role) ? (
              <ProfilPage
                role={role}
                report={report}
                trainees={trainees}
                users={users}
                theme={theme}
                themePreference={themePreference}
                onToggleTheme={async () => {
                  await toggleTheme();
                  setFlash({ type: "success", message: `Darstellung auf ${theme === "dark" ? "hell" : "dunkel"} umgestellt.` });
                }}
                onSaveThemePreference={async (nextPreference) => {
                  await saveThemePreference(nextPreference);
                  setFlash({ type: "success", message: `Darstellung auf ${nextPreference === "system" ? "Systemstandard" : nextPreference} gesetzt.` });
                }}
                onSaveManagedProfile={async (userId, profile) => {
                  await updateManagedProfile(userId, profile);
                  setFlash({ type: "success", message: "Profil gespeichert." });
                }}
                onChangeOwnPassword={async (payload) => {
                  await changeOwnPassword(payload);
                  setFlash({ type: "success", message: "Dein Passwort wurde erfolgreich geändert." });
                }}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/export"
          element={
            role === "trainee" ? (
              <ExportPage
                report={report}
                onPreviewImport={previewReportImport}
                onImportReports={async (payload) => {
                  const data = await importReports(payload);
                  setFlash({ type: "success", message: `${data.importedCount} Berichte importiert.` });
                  return data;
                }}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route path="/archiv" element={<ArchivPage role={role} report={report} trainees={trainees} />} />
        <Route
          path="/verwaltung"
          element={
            role === "admin" ? (
              <AdminUsersPage
                users={users}
                educations={educations}
                onPreviewUserImport={previewUserImport}
                onImportUsers={async (payload) => {
                  const data = await importUsers(payload);
                  setFlash({ type: "success", message: `${data.importedCount} Nutzer importiert.` });
                  return data;
                }}
                onLoadAuditLogs={loadAuditLogs}
                onAssignTrainer={async (traineeId, trainerIds) => {
                  await assignTrainer(traineeId, trainerIds);
                  setFlash({ type: "success", message: "Ausbilder-Zuordnung gespeichert." });
                }}
                onUpdateUser={async (userId, payload) => {
                  await updateUser(userId, payload);
                  setFlash({ type: "success", message: "Benutzer aktualisiert." });
                }}
                onDeleteUser={async (userId) => {
                  const data = await deleteUser(userId);
                  setFlash({ type: "success", message: `${data.deletedUser?.name || "Benutzer"} geloescht.` });
                  return data;
                }}
                onCreateUser={async (payload) => {
                  await createUser(payload);
                  setFlash({ type: "success", message: "Nutzer angelegt." });
                }}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

function AppContent() {
  const { session } = useAppContext();
  if (!session.ready) {
    return <div className="screen-loading">Portal wird geladen...</div>;
  }
  return <ProtectedApp />;
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
