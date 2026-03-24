import React, { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { PrimaryButton } from "../components/PrimaryButton";

function toEditForm(user) {
  return {
    name: user.name || "",
    username: user.username || "",
    email: user.email || "",
    password: "",
    role: user.role || "trainee",
    trainerId: user.trainer_id || ""
  };
}

export function AdminUsersPage({ users, onCreateUser, onAssignTrainer, onUpdateUser }) {
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", role: "trainee", trainerId: "" });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [createError, setCreateError] = useState("");
  const [editError, setEditError] = useState("");
  const [assignError, setAssignError] = useState("");

  const trainers = users.filter((user) => user.role === "trainer");
  const trainees = users.filter((user) => user.role === "trainee");
  const trainerNames = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));

  function startEditing(user) {
    setEditingUserId(user.id);
    setEditForm(toEditForm(user));
  }

  function stopEditing() {
    setEditingUserId(null);
    setEditForm(null);
    setEditError("");
  }

  async function handleCreateUser() {
    setCreateError("");
    try {
      await onCreateUser({
        ...form,
        trainerId: form.role === "trainee" && form.trainerId ? Number(form.trainerId) : null
      });
      setForm({ name: "", username: "", email: "", password: "", role: "trainee", trainerId: "" });
    } catch (error) {
      setCreateError(error.message);
    }
  }

  async function handleUpdateUser(userId) {
    setEditError("");
    try {
      await onUpdateUser(userId, {
        ...editForm,
        trainerId: editForm.role === "trainee" && editForm.trainerId ? Number(editForm.trainerId) : null
      });
      stopEditing();
    } catch (error) {
      setEditError(error.message);
    }
  }

  async function handleAssignTrainer(traineeId, trainerId) {
    setAssignError("");
    try {
      await onAssignTrainer(traineeId, trainerId);
    } catch (error) {
      setAssignError(error.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader kicker="Verwaltung" title="Benutzer und Rollen" subtitle="Nutzer anlegen, bearbeiten und Ausbilder nachtraeglich zuweisen." />
      <section className="reports-layout">
        <article className="panel-card">
          <PageHeader kicker="Neuer Nutzer" title="Benutzer anlegen" />
          <div className="form-grid">
            <label>
              Name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              E-Mail
              <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label>
              Benutzername
              <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
            </label>
            <label>
              Passwort
              <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </label>
            <label>
              Rolle
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="trainee">Azubi</option>
                <option value="trainer">Ausbilder</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            {form.role === "trainee" ? (
              <label>
                Ausbilder
                <select value={form.trainerId} onChange={(event) => setForm({ ...form, trainerId: event.target.value })}>
                  <option value="">Kein Ausbilder</option>
                  {trainers.map((trainer) => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {createError ? <div className="field-message error">{createError}</div> : null}
          <div className="inline-notice">
            <strong>Hinweis:</strong> Die E-Mail muss gueltig sein und das Passwort mindestens 10 Zeichen haben.
          </div>
          <div className="editor-footer">
            <PrimaryButton onClick={handleCreateUser}>Nutzer speichern</PrimaryButton>
          </div>
        </article>

        <article className="panel-card">
          <PageHeader kicker="Benutzerliste" title="Konten im System" subtitle="Rollen und Zuweisungen im Ueberblick." />
          <DataTable
            rowKey="id"
            rows={users}
            columns={[
              { key: "name", label: "Name" },
              { key: "username", label: "Benutzername" },
              { key: "email", label: "E-Mail" },
              { key: "role", label: "Rolle" },
              { key: "betrieb", label: "Betrieb" },
              {
                key: "trainer",
                label: "Ausbilder",
                render: (row) => (row.role === "trainee" ? trainerNames.get(row.trainer_id) || "-" : "-")
              }
            ]}
          />
        </article>
      </section>

      <section className="panel-card">
        <PageHeader kicker="Bearbeitung" title="Bestehende Nutzer verwalten" subtitle="Rollen, Passwoerter und Ausbilder-Zuweisungen koennen jederzeit geaendert werden." />
        {editError ? <div className="field-message error">{editError}</div> : null}
        <div className="assignment-list admin-edit-list">
          {users.map((user) => (
            <div key={user.id} className="assignment-row admin-edit-row">
              {editingUserId === user.id && editForm ? (
                <div className="admin-edit-form">
                  <div className="form-grid">
                    <label>
                      Name
                      <input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
                    </label>
                    <label>
                      E-Mail
                      <input value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
                    </label>
                    <label>
                      Benutzername
                      <input value={editForm.username} onChange={(event) => setEditForm({ ...editForm, username: event.target.value })} />
                    </label>
                    <label>
                      Rolle
                      <select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}>
                        <option value="trainee">Azubi</option>
                        <option value="trainer">Ausbilder</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <label>
                      Neues Passwort
                      <input
                        type="password"
                        placeholder="Leer lassen um beizubehalten"
                        value={editForm.password}
                        onChange={(event) => setEditForm({ ...editForm, password: event.target.value })}
                      />
                    </label>
                    {editForm.role === "trainee" ? (
                      <label>
                        Ausbilder
                        <select value={editForm.trainerId} onChange={(event) => setEditForm({ ...editForm, trainerId: event.target.value })}>
                          <option value="">Kein Ausbilder</option>
                          {trainers
                            .filter((trainer) => trainer.id !== user.id)
                            .map((trainer) => (
                              <option key={trainer.id} value={trainer.id}>
                                {trainer.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  <div className="editor-footer">
                    <PrimaryButton onClick={() => handleUpdateUser(user.id)}>Änderungen speichern</PrimaryButton>
                    <PrimaryButton variant="ghost" onClick={stopEditing}>
                      Abbrechen
                    </PrimaryButton>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{user.name}</strong>
                    <p>{user.username} · {user.email}</p>
                  </div>
                  <div className="admin-edit-meta">
                    <span>Rolle: {user.role}</span>
                    <span>{user.role === "trainee" ? `Ausbilder: ${trainerNames.get(user.trainer_id) || "Kein Ausbilder"}` : "Keine Ausbilder-Zuordnung"}</span>
                  </div>
                  <div className="assignment-actions">
                    <PrimaryButton variant="secondary" onClick={() => startEditing(user)}>
                      Bearbeiten
                    </PrimaryButton>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <PageHeader kicker="Zuweisung" title="Azubis Ausbildern zuordnen" subtitle="Bestehende Azubis koennen hier schnell einem Ausbilder zugewiesen werden." />
        {assignError ? <div className="field-message error">{assignError}</div> : null}
        <div className="assignment-list">
          {trainees.map((trainee) => (
            <div key={trainee.id} className="assignment-row">
              <div>
                <strong>{trainee.name}</strong>
                <p>{trainee.email}</p>
              </div>
              <div className="assignment-actions">
                <select
                  value={trainee.trainer_id || ""}
                  onChange={(event) => handleAssignTrainer(trainee.id, event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">Kein Ausbilder</option>
                  {trainers.map((trainer) => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
