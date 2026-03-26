import React, { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { PrimaryButton } from "../components/PrimaryButton";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";

function buildUserForm(user = null) {
  return {
    name: user?.name || "",
    username: user?.username || "",
    email: user?.email || "",
    password: "",
    role: user?.role || "trainee",
    ausbildung: user?.ausbildung || "",
    betrieb: user?.betrieb || "",
    berufsschule: user?.berufsschule || "",
    trainerIds: Array.isArray(user?.trainerIds) ? user.trainerIds.map(Number) : []
  };
}

function roleLabel(role) {
  if (role === "trainee") return "Azubi";
  if (role === "trainer") return "Ausbilder";
  return "Admin";
}

function toggleId(list, id) {
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
}

function formatRelationshipList(items, emptyLabel) {
  if (!items?.length) return emptyLabel;
  return items.map((item) => item.name).join(", ");
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function EducationField({ value, educations, onChange, listId }) {
  return (
    <label>
      Ausbildung
      <input list={listId} value={value} onChange={(event) => onChange(event.target.value)} placeholder="z. B. Fachinformatiker Systemintegration" />
      <datalist id={listId}>
        {educations.map((education) => (
          <option key={education.id || education.name} value={education.name} />
        ))}
      </datalist>
    </label>
  );
}

function TrainerMultiSelect({ trainers, value, onChange, excludeUserId }) {
  const availableTrainers = trainers.filter((trainer) => trainer.id !== excludeUserId);

  return (
    <div className="admin-trainer-selector">
      <div className="admin-section-label">
        <strong>Zugeordnete Ausbilder</strong>
        <small>Mehrfachauswahl, doppelte Zuordnungen werden verhindert.</small>
      </div>
      {availableTrainers.length ? (
        <div className="admin-chip-grid">
          {availableTrainers.map((trainer) => {
            const checked = value.includes(trainer.id);
            return (
              <label key={trainer.id} className={`admin-choice-chip${checked ? " active" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(toggleId(value, trainer.id))}
                />
                <span>{trainer.name}</span>
                <small>{trainer.email}</small>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="field-message">Noch keine Ausbilder vorhanden.</p>
      )}
    </div>
  );
}

function UserForm({ title, subtitle, form, setForm, trainers, educations, submitLabel, onSubmit, onCancel, error, editingUserId = null }) {
  const isTrainee = form.role === "trainee";

  return (
    <article className="panel-card admin-form-card">
      <PageHeader kicker="Verwaltung" title={title} subtitle={subtitle} />
      <div className="form-grid">
        <label>
          Name
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          Benutzername
          <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        </label>
        <label>
          E-Mail
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>
        <label>
          {editingUserId ? "Neues Passwort" : "Passwort"}
          <input
            type="password"
            placeholder={editingUserId ? "Leer lassen um beizubehalten" : ""}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>
        <label>
          Rolle
          <select
            value={form.role}
            onChange={(event) => {
              const nextRole = event.target.value;
              setForm({
                ...form,
                role: nextRole,
                trainerIds: nextRole === "trainee" ? form.trainerIds : []
              });
            }}
          >
            <option value="trainee">Azubi</option>
            <option value="trainer">Ausbilder</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <EducationField
          value={form.ausbildung}
          educations={educations}
          onChange={(ausbildung) => setForm({ ...form, ausbildung })}
          listId={editingUserId ? `admin-education-options-${editingUserId}` : "admin-education-options-create"}
        />
        <label>
          Betrieb
          <input value={form.betrieb} onChange={(event) => setForm({ ...form, betrieb: event.target.value })} />
        </label>
        <label>
          Berufsschule
          <input value={form.berufsschule} onChange={(event) => setForm({ ...form, berufsschule: event.target.value })} />
        </label>
      </div>
      {isTrainee ? (
        <TrainerMultiSelect
          trainers={trainers}
          value={form.trainerIds}
          onChange={(trainerIds) => setForm({ ...form, trainerIds })}
          excludeUserId={editingUserId}
        />
      ) : null}
      {error ? <div className="field-message error">{error}</div> : null}
      <div className="editor-footer">
        <PrimaryButton onClick={onSubmit}>{submitLabel}</PrimaryButton>
        {onCancel ? (
          <PrimaryButton variant="ghost" onClick={onCancel}>
            Abbrechen
          </PrimaryButton>
        ) : null}
      </div>
    </article>
  );
}

function UserImportRowPreview({ row }) {
  const canImport = row.canImport;

  return (
    <div className={`import-row-card${canImport ? "" : " invalid"}`}>
      <div className="import-row-head">
        <strong>Zeile {row.rowNumber}</strong>
        <StatusBadge status={canImport ? "signed" : "invalid"} />
      </div>
      <div className="import-row-grid">
        <span>{row.name || "-"}</span>
        <span>{row.username || "-"}</span>
        <span>{row.email || "-"}</span>
        <span>{roleLabel(row.role || "-")}</span>
      </div>
      <div className="import-row-grid">
        <span>{row.ausbildung || "-"}</span>
        <span>{row.betrieb || "-"}</span>
        <span>{row.berufsschule || "-"}</span>
        <span>{row.trainerUsernames?.length ? row.trainerUsernames.join(" | ") : "-"}</span>
      </div>
      {row.errors?.length ? <p className="field-message error">{row.errors.join(" | ")}</p> : null}
      {row.warnings?.length ? <p className="field-message">{row.warnings.join(" | ")}</p> : null}
    </div>
  );
}

function UserImportPanel({ onPreviewUserImport, onImportUsers }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importPayload, setImportPayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const summary = preview?.summary || { totalRows: 0, validRows: 0, invalidRows: 0 };

  async function handlePreview() {
    if (!selectedFile) {
      setError("Bitte zuerst eine CSV-Datei auswaehlen.");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const contentBase64 = await readFileAsBase64(selectedFile);
      const payload = {
        filename: selectedFile.name,
        contentBase64
      };
      const data = await onPreviewUserImport(payload);
      setImportPayload(payload);
      setPreview(data);
    } catch (previewError) {
      setPreview(null);
      setImportPayload(null);
      setError(previewError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!importPayload) {
      setError("Bitte zuerst eine Vorschau erzeugen.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const data = await onImportUsers(importPayload);
      setResult(data);
      setPreview(null);
      setImportPayload(null);
      setSelectedFile(null);
    } catch (importError) {
      setError(importError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel-card admin-form-card">
      <PageHeader
        kicker="CSV-Import"
        title="Benutzer gesammelt importieren"
        subtitle="CSV hochladen, serverseitig pruefen, Vorschau ansehen und erst dann anlegen."
      />
      <div className="export-panel">
        <label>
          CSV-Datei
          <input
            type="file"
            accept=".csv"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] || null);
              setPreview(null);
              setImportPayload(null);
              setResult(null);
              setError("");
            }}
          />
        </label>
        <div className="inline-notice">
          <strong>Erwartete Spalten:</strong> `name`, `username`, `email`, `role`, optional `password`, `ausbildung`, `betrieb`, `berufsschule`, `trainer_usernames`
        </div>
        <div className="page-actions">
          <a className="button button-secondary" href="/benutzer_import_vorlage.csv" download>
            Beispiel-CSV herunterladen
          </a>
          <PrimaryButton onClick={handlePreview} disabled={busy}>
            Vorschau laden
          </PrimaryButton>
        </div>
        {selectedFile ? <p>Ausgewaehlt: {selectedFile.name}</p> : null}
        {error ? <div className="field-message error">{error}</div> : null}
        {result?.generatedCredentials?.length ? (
          <div className="inline-notice">
            <strong>Zufaellige Initialpasswoerter:</strong> {result.generatedCredentials.map((entry) => `${entry.username}: ${entry.generatedPassword}`).join(" | ")}
          </div>
        ) : null}
      </div>

      {preview ? (
        <div className="page-stack">
          <div className="import-summary-grid">
            <div className="read-only-card">
              <span>Erkannte Zeilen</span>
              <strong>{summary.totalRows}</strong>
            </div>
            <div className="read-only-card">
              <span>Gueltig</span>
              <strong>{summary.validRows}</strong>
            </div>
            <div className="read-only-card">
              <span>Fehlerhaft</span>
              <strong>{summary.invalidRows}</strong>
            </div>
            <div className="read-only-card">
              <span>Importmodus</span>
              <strong>Nur neue Nutzer</strong>
            </div>
          </div>
          <div className="editor-footer">
            <PrimaryButton onClick={handleImport} disabled={busy || !summary.validRows}>
              {summary.validRows} Nutzer importieren
            </PrimaryButton>
          </div>
          <div className="import-row-list">
            {preview.rows.length ? preview.rows.map((row) => <UserImportRowPreview key={`${row.rowNumber}-${row.username}-${row.email}`} row={row} />) : null}
          </div>
        </div>
      ) : (
        <EmptyState title="Noch keine Vorschau" description="Lade eine CSV hoch, um gueltige und fehlerhafte Datensaetze vor dem Import zu sehen." />
      )}
    </article>
  );
}

export function AdminUsersPage({ users, educations, onCreateUser, onAssignTrainer, onUpdateUser, onPreviewUserImport, onImportUsers }) {
  const [form, setForm] = useState(buildUserForm());
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [createError, setCreateError] = useState("");
  const [editError, setEditError] = useState("");
  const [assignError, setAssignError] = useState("");
  const editPanelRef = useRef(null);

  const trainers = useMemo(() => users.filter((user) => user.role === "trainer"), [users]);
  const trainees = useMemo(() => users.filter((user) => user.role === "trainee"), [users]);
  const managedEducations = useMemo(() => educations || [], [educations]);
  const editingUser = users.find((user) => user.id === editingUserId) || null;

  useEffect(() => {
    if (editingUserId && editPanelRef.current) {
      editPanelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingUserId]);

  function startEditing(user) {
    setEditingUserId(user.id);
    setEditForm(buildUserForm(user));
    setEditError("");
  }

  function stopEditing() {
    setEditingUserId(null);
    setEditForm(null);
    setEditError("");
  }

  async function handleCreateUser() {
    setCreateError("");
    try {
      await onCreateUser(form);
      setForm(buildUserForm());
    } catch (error) {
      setCreateError(error.message);
    }
  }

  async function handleUpdateUser(userId) {
    setEditError("");
    try {
      await onUpdateUser(userId, editForm);
      stopEditing();
    } catch (error) {
      setEditError(error.message);
    }
  }

  async function handleAssignTrainers(traineeId, trainerIds) {
    setAssignError("");
    try {
      await onAssignTrainer(traineeId, trainerIds);
    } catch (error) {
      setAssignError(error.message);
    }
  }

  return (
    <div className="page-stack admin-users-page">
      <PageHeader
        kicker="Verwaltung"
        title="Benutzerverwaltung"
        subtitle="Nutzer, Rollen, Ausbildung, CSV-Import und Ausbilder-Zuordnungen verwalten."
      />

      {editingUserId && editForm ? (
        <section ref={editPanelRef}>
          <UserForm
            title={`Benutzer bearbeiten${editingUser ? `: ${editingUser.name}` : ""}`}
            subtitle="Bearbeitung wird direkt mit den vorhandenen Stammdaten und Mehrfach-Zuordnungen befuellt."
            form={editForm}
            setForm={setEditForm}
            trainers={trainers}
            educations={managedEducations}
            submitLabel="Aenderungen speichern"
            onSubmit={() => handleUpdateUser(editingUserId)}
            onCancel={stopEditing}
            error={editError}
            editingUserId={editingUserId}
          />
        </section>
      ) : null}

      <section className="admin-users-layout">
        <div className="page-stack">
          <UserForm
            title="Benutzer anlegen"
            subtitle="Neuen Nutzer erfassen."
            form={form}
            setForm={setForm}
            trainers={trainers}
            educations={managedEducations}
            submitLabel="Nutzer speichern"
            onSubmit={handleCreateUser}
            error={createError}
          />

          <UserImportPanel onPreviewUserImport={onPreviewUserImport} onImportUsers={onImportUsers} />
        </div>

        <article className="panel-card admin-overview-card">
          <PageHeader kicker="Uebersicht" title="Benutzer" subtitle={`${users.length} Konten`} />
          <div className="admin-user-grid">
            {users.map((user) => (
              <article key={user.id} className="admin-user-card">
                <div className="admin-user-card-head">
                  <div>
                    <strong>{user.name}</strong>
                    <p>{user.username} · {user.email}</p>
                  </div>
                  <span className="admin-role-pill">{roleLabel(user.role)}</span>
                </div>
                <div className="admin-user-facts">
                  <span>Rolle: {roleLabel(user.role)}</span>
                  <span>Ausbildung: {user.ausbildung || "-"}</span>
                  <span>Betrieb: {user.betrieb || "-"}</span>
                </div>
                <div className="admin-user-relations">
                  {user.role === "trainee" ? (
                    <p>Ausbilder: {formatRelationshipList(user.assignedTrainers, "Keine Ausbilder zugeordnet")}</p>
                  ) : user.role === "trainer" ? (
                    <p>Betreut: {formatRelationshipList(user.assignedTrainees, "Keine Azubis zugeordnet")}</p>
                  ) : (
                    <p>Administrator ohne fachliche Zuordnung.</p>
                  )}
                </div>
                <div className="assignment-actions">
                  <PrimaryButton variant="secondary" onClick={() => startEditing(user)}>
                    Bearbeiten
                  </PrimaryButton>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="panel-card admin-assignment-card">
        <PageHeader
          kicker="Zuordnungen"
          title="Azubis mehreren Ausbildern zuordnen"
          subtitle={`${trainees.length} Azubis`}
        />
        {assignError ? <div className="field-message error">{assignError}</div> : null}
        <div className="admin-assignment-list">
          {trainees.map((trainee) => (
            <div key={trainee.id} className="admin-assignment-row">
              <div className="admin-assignment-copy">
                <strong>{trainee.name}</strong>
                <p>{trainee.ausbildung || trainee.email}</p>
                <small>{formatRelationshipList(trainee.assignedTrainers, "Keine Ausbilder zugeordnet")}</small>
              </div>
              <div className="admin-chip-grid compact">
                {trainers.map((trainer) => {
                  const checked = trainee.trainerIds.includes(trainer.id);
                  return (
                    <label key={`${trainee.id}-${trainer.id}`} className={`admin-choice-chip${checked ? " active" : ""}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleAssignTrainers(trainee.id, toggleId(trainee.trainerIds, trainer.id))}
                      />
                      <span>{trainer.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {!trainees.length ? <p className="field-message">Noch keine Azubis vorhanden.</p> : null}
        </div>
      </section>
    </div>
  );
}
