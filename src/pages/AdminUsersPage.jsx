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
  if (role === "system") return "System";
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
      setError("Bitte zuerst eine CSV-Datei auswählen.");
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
        <div className="page-actions">
          <a className="button button-secondary" href="/benutzer_import_vorlage.csv" download>
            Beispiel-CSV herunterladen
          </a>
          <PrimaryButton onClick={handlePreview} disabled={busy}>
            Vorschau laden
          </PrimaryButton>
        </div>
        {selectedFile ? <p>Ausgewählt: {selectedFile.name}</p> : null}
        {error ? <div className="field-message error">{error}</div> : null}
        {result?.generatedCredentials?.length ? (
          <div className="inline-notice">
            <strong>Zufällige Initialpasswörter:</strong> {result.generatedCredentials.map((entry) => `${entry.username}: ${entry.generatedPassword}`).join(" | ")}
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
              <span>Gültig</span>
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
        <EmptyState title="Noch keine Vorschau" />
      )}
    </article>
  );
}

const AUDIT_ACTION_OPTIONS = [
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DELETED",
  "ROLE_CHANGED",
  "TRAINER_ASSIGNED",
  "TRAINER_UNASSIGNED",
  "PROFILE_UPDATED_BY_ADMIN",
  "GRADE_CREATED",
  "GRADE_UPDATED",
  "GRADE_DELETED",
  "REPORT_SUBMITTED",
  "REPORT_APPROVED",
  "REPORT_RETURNED",
  "REPORT_SIGNED",
  "CSV_IMPORT_EXECUTED"
];

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function actionLabel(actionType) {
  return String(actionType || "")
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function getAuditTargetLabel(log, usersById) {
  const metadata = log.metadata || {};
  if (metadata.traineeName) return metadata.traineeName;
  if (metadata.trainerName) return metadata.trainerName;
  if (metadata.username) return metadata.username;
  if (metadata.role && log.targetUserId && usersById.has(log.targetUserId)) {
    return usersById.get(log.targetUserId).name;
  }
  if (log.targetUserId && usersById.has(log.targetUserId)) {
    return usersById.get(log.targetUserId).name;
  }
  if (metadata.importedCount) {
    return `${metadata.importedCount} Nutzer`;
  }
  return `${log.entityType} ${log.entityId || ""}`.trim();
}

function AuditLogRow({ log, usersById }) {
  const targetLabel = getAuditTargetLabel(log, usersById);

  return (
    <article className="audit-log-row">
      <div className="audit-log-row-head">
        <div>
          <strong>{formatDateTime(log.createdAt)}</strong>
          <p>{actionLabel(log.actionType)}</p>
        </div>
        <span className="audit-log-action-pill">{log.actionType}</span>
      </div>
      <div className="audit-log-grid">
        <span>
          <strong>Ausgeführt von:</strong> {log.actorName} ({roleLabel(log.actorRole)})
        </span>
        <span>
          <strong>Betroffen:</strong> {targetLabel}
        </span>
      </div>
      <p className="audit-log-summary">{log.summary}</p>
      {log.changes || log.metadata ? (
        <details className="audit-log-details">
          <summary>Details</summary>
          <pre>{JSON.stringify({ changes: log.changes, metadata: log.metadata }, null, 2)}</pre>
        </details>
      ) : null}
    </article>
  );
}

function AdminAuditLogPanel({ users, onLoadAuditLogs }) {
  const [filters, setFilters] = useState({
    search: "",
    actionType: "",
    userId: "",
    from: "",
    to: ""
  });
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    actionType: "",
    userId: "",
    from: "",
    to: ""
  });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState({
    items: [],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1
    }
  });

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setBusy(true);
      setError("");
      try {
        const data = await onLoadAuditLogs({
          ...appliedFilters,
          page,
          pageSize: 20
        });
        if (!cancelled) {
          setResult(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [appliedFilters, onLoadAuditLogs, page]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(filters);
  }

  function resetFilters() {
    const cleared = {
      search: "",
      actionType: "",
      userId: "",
      from: "",
      to: ""
    };
    setFilters(cleared);
    setAppliedFilters(cleared);
    setPage(1);
  }

  return (
    <section className="page-stack">
      <article className="panel-card">
        <PageHeader
          kicker="Audit-Log"
          title="Admin-Logs"
        />
        <div className="audit-log-toolbar">
          <label>
            Suche
            <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Aktion, Benutzer oder Beschreibung" />
          </label>
          <label>
            Aktion
            <select value={filters.actionType} onChange={(event) => setFilters({ ...filters, actionType: event.target.value })}>
              <option value="">Alle Aktionen</option>
              {AUDIT_ACTION_OPTIONS.map((actionType) => (
                <option key={actionType} value={actionType}>
                  {actionType}
                </option>
              ))}
            </select>
          </label>
          <label>
            Benutzer
            <select value={filters.userId} onChange={(event) => setFilters({ ...filters, userId: event.target.value })}>
              <option value="">Alle Benutzer</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.username})
                </option>
              ))}
            </select>
          </label>
          <label>
            Von
            <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          </label>
          <label>
            Bis
            <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          </label>
        </div>
        <div className="page-actions">
          <PrimaryButton onClick={applyFilters} disabled={busy}>
            Filter anwenden
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={resetFilters} disabled={busy}>
            Zurücksetzen
          </PrimaryButton>
        </div>
        {error ? <div className="field-message error">{error}</div> : null}
        <div className="field-message">Seite {result.pagination.page} von {result.pagination.totalPages}</div>
      </article>

      {busy ? <div className="field-message">Audit-Log wird geladen...</div> : null}
      {!busy && !result.items.length ? (
        <EmptyState title="Keine Logeinträge gefunden" />
      ) : null}
      {result.items.length ? (
        <div className="audit-log-list">
          {result.items.map((log) => (
            <AuditLogRow key={log.id} log={log} usersById={usersById} />
          ))}
        </div>
      ) : null}
      <div className="editor-footer">
        <PrimaryButton variant="ghost" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={busy || result.pagination.page <= 1}>
          Vorherige Seite
        </PrimaryButton>
        <PrimaryButton onClick={() => setPage((current) => Math.min(result.pagination.totalPages, current + 1))} disabled={busy || result.pagination.page >= result.pagination.totalPages}>
          Nächste Seite
        </PrimaryButton>
      </div>
    </section>
  );
}

export function AdminUsersPage({ users, educations, onCreateUser, onAssignTrainer, onUpdateUser, onPreviewUserImport, onImportUsers, onLoadAuditLogs }) {
  const [form, setForm] = useState(buildUserForm());
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [createError, setCreateError] = useState("");
  const [editError, setEditError] = useState("");
  const [assignError, setAssignError] = useState("");
  const [activeView, setActiveView] = useState("users");
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
      />
      <div className="admin-section-tabs">
        <button type="button" className={`admin-section-tab${activeView === "users" ? " active" : ""}`} onClick={() => setActiveView("users")}>
          Benutzerverwaltung
        </button>
        <button type="button" className={`admin-section-tab${activeView === "audit" ? " active" : ""}`} onClick={() => setActiveView("audit")}>
          Audit-Log
        </button>
      </div>

      {activeView === "users" ? (
        <>
          {editingUserId && editForm ? (
            <section ref={editPanelRef}>
              <UserForm
                title={`Benutzer bearbeiten${editingUser ? `: ${editingUser.name}` : ""}`}
                subtitle=""
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
                subtitle=""
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
              <PageHeader kicker="Übersicht" title="Benutzer" subtitle={`${users.length} Konten`} />
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
        </>
      ) : (
        <AdminAuditLogPanel users={users} onLoadAuditLogs={onLoadAuditLogs} />
      )}
    </div>
  );
}
