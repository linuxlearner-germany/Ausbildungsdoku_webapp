import React from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AppProvider, useAppContext } from "./context/AppContext";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TagesberichtePage } from "./pages/TagesberichtePage";
import { KalenderPage } from "./pages/KalenderPage";
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
    flash,
    setFlash,
    logout,
    getTraineeReport,
    updateProfile,
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

  return (
    <AppShell
      user={session.user}
      theme={theme}
      flash={flash}
      onLogout={logout}
      onToggleTheme={() => {
        toggleTheme();
        setFlash({ type: "success", message: `Darstellung auf ${theme === "dark" ? "hell" : "dunkel"} umgestellt.` });
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage role={role} report={report} trainees={trainees} users={users} />} />
        <Route
          path="/tagesberichte"
          element={
            role === "trainee" ? (
              <TagesberichtePage
                report={report}
                onCreate={async () => {
                  const id = await createOrFocusEntry();
                  setFlash({ type: "success", message: "Neuer Tagesbericht angelegt." });
                  return id;
                }}
                onSaveEntry={async (entryId, entry) => {
                  await saveEntry(entryId, entry);
                  setFlash({ type: "success", message: "Tagesbericht gespeichert." });
                }}
                onDeleteEntry={async (entryId) => {
                  await deleteEntry(entryId);
                  setFlash({ type: "success", message: "Tagesbericht gelöscht." });
                }}
                onSubmitEntry={async (entryId) => {
                  await submitEntry(entryId);
                  setFlash({ type: "success", message: "Tagesbericht eingereicht." });
                }}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/kalender"
          element={
            role === "trainee" ? (
              <KalenderPage
                report={report}
                selectedDate={null}
                onSelectDate={async (date) => {
                  const id = await createOrFocusEntry(date);
                  setFlash({ type: "success", message: `Tagesbericht für ${date} geöffnet.` });
                  navigate("/tagesberichte", { replace: false, state: { focusEntryId: id } });
                }}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
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
            role === "trainee" ? (
              <NotenPage
                grades={grades}
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
            role === "trainee" ? (
              <ProfilPage
                report={report}
                theme={theme}
                onToggleTheme={() => {
                  toggleTheme();
                  setFlash({ type: "success", message: `Darstellung auf ${theme === "dark" ? "hell" : "dunkel"} umgestellt.` });
                }}
                onSaveProfile={async (profile) => {
                  await updateProfile(profile);
                  setFlash({ type: "success", message: "Profil gespeichert." });
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
              <ExportPage report={report} />
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
                onAssignTrainer={async (traineeId, trainerId) => {
                  await assignTrainer(traineeId, trainerId);
                  setFlash({ type: "success", message: "Azubi wurde einem Ausbilder zugeordnet." });
                }}
                onUpdateUser={async (userId, payload) => {
                  await updateUser(userId, payload);
                  setFlash({ type: "success", message: "Benutzer aktualisiert." });
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
