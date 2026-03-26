import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { PrimaryButton } from "../components/PrimaryButton";
import { EmptyState } from "../components/EmptyState";

function buildProfileForm(profile) {
  return {
    name: profile?.name || "",
    ausbildung: profile?.ausbildung || "",
    betrieb: profile?.betrieb || "",
    berufsschule: profile?.berufsschule || ""
  };
}

function ProfileDetailGrid({ profile }) {
  const items = [
    { label: "Name", value: profile?.name || "-" },
    { label: "Ausbildung", value: profile?.ausbildung || "-" },
    { label: "Betrieb", value: profile?.betrieb || "-" },
    { label: "Berufsschule", value: profile?.berufsschule || "-" }
  ];

  return (
    <div className="read-only-grid">
      {items.map((item) => (
        <div key={item.label} className="read-only-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ThemeSettingsPanel({ theme, themePreference, onToggleTheme, onSaveThemePreference }) {
  return (
    <section className="panel-card">
      <PageHeader
        kicker="Persoenliche Einstellungen"
        title="Anzeige und Theme"
        subtitle="Diese Einstellungen betreffen nur deine Benutzeroberflaeche und keine Stammdaten."
      />
      <div className="theme-settings-layout">
        <div className="theme-state">
          <strong>Aktive Darstellung</strong>
          <span>{theme === "dark" ? "Dark Mode" : "Light Mode"}</span>
          <small className="field-message">Gespeicherte Praeferenz: {themePreference === "system" ? "System" : themePreference}</small>
        </div>
        <label>
          Theme-Praeferenz
          <select value={themePreference} onChange={(event) => onSaveThemePreference(event.target.value)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <PrimaryButton variant="secondary" onClick={onToggleTheme}>
          Schnell umschalten
        </PrimaryButton>
      </div>
    </section>
  );
}

function PasswordChangePanel({ onChangeOwnPassword }) {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    newPasswordRepeat: ""
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  function updateForm(nextPartial) {
    setError("");
    setSuccess("");
    setForm((current) => ({ ...current, ...nextPartial }));
  }

  async function handleSubmit() {
    setError("");
    setSuccess("");

    if (!form.currentPassword) {
      setError("Bitte aktuelles Passwort eingeben.");
      return;
    }

    if (!form.newPassword) {
      setError("Bitte neues Passwort eingeben.");
      return;
    }

    if (form.newPassword.length < 10) {
      setError("Das neue Passwort muss mindestens 10 Zeichen lang sein.");
      return;
    }

    if (form.newPassword !== form.newPasswordRepeat) {
      setError("Neues Passwort und Wiederholung stimmen nicht ueberein.");
      return;
    }

    if (form.currentPassword === form.newPassword) {
      setError("Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.");
      return;
    }

    setBusy(true);
    try {
      await onChangeOwnPassword(form);
      setForm({
        currentPassword: "",
        newPassword: "",
        newPasswordRepeat: ""
      });
      setSuccess("Dein Passwort wurde erfolgreich geaendert.");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-card">
      <PageHeader
        kicker="Sicherheit"
        title="Passwort aendern"
        subtitle="Hier aenderst du ausschliesslich das Passwort deines eigenen Benutzerkontos."
      />
      <div className="form-grid">
        <label>
          Aktuelles Passwort
          <input
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(event) => updateForm({ currentPassword: event.target.value })}
          />
        </label>
        <label>
          Neues Passwort
          <input
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(event) => updateForm({ newPassword: event.target.value })}
          />
        </label>
        <label>
          Neues Passwort wiederholen
          <input
            type="password"
            autoComplete="new-password"
            value={form.newPasswordRepeat}
            onChange={(event) => updateForm({ newPasswordRepeat: event.target.value })}
          />
        </label>
      </div>
      <div className="inline-notice">
        <strong>Passwortregeln:</strong>
        <ul className="inline-notice-list">
          <li>Das neue Passwort muss mindestens 10 Zeichen lang sein.</li>
          <li>Es muss mindestens einen Großbuchstaben, einen Kleinbuchstaben, eine Zahl und ein Sonderzeichen enthalten.</li>
          <li>Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.</li>
          <li>Neues Passwort und Wiederholung müssen exakt übereinstimmen.</li>
        </ul>
      </div>
      {error ? <div className="field-message error">{error}</div> : null}
      {success ? <div className="field-message success">{success}</div> : null}
      <div className="editor-footer">
        <PrimaryButton onClick={handleSubmit} disabled={busy}>
          Passwort speichern
        </PrimaryButton>
      </div>
    </section>
  );
}

export function ProfilPage({ role, report, trainees, users, theme, themePreference, onToggleTheme, onSaveThemePreference, onSaveManagedProfile, onChangeOwnPassword }) {
  const targets = useMemo(() => {
    if (role === "trainer") {
      return trainees || [];
    }
    if (role === "admin") {
      return (users || []).filter((user) => user.role === "trainee");
    }
    return [];
  }, [role, trainees, users]);

  const [selectedId, setSelectedId] = useState(() => targets[0]?.id || null);
  const selectedProfile = targets.find((target) => target.id === selectedId) || null;
  const [form, setForm] = useState(buildProfileForm(selectedProfile));

  useEffect(() => {
    if (!targets.length) {
      setSelectedId(null);
      return;
    }

    if (!targets.some((target) => target.id === selectedId)) {
      setSelectedId(targets[0].id);
    }
  }, [selectedId, targets]);

  useEffect(() => {
    setForm(buildProfileForm(selectedProfile));
  }, [selectedProfile]);

  if (role === "trainee") {
    return (
      <div className="page-stack">
        <PageHeader
          kicker="Profil"
          title="Persoenliche und betriebliche Daten"
          subtitle="Deine Stammdaten werden durch Ausbilder oder Admin gepflegt. Du kannst sie hier nur einsehen."
          actions={
            <a className="button button-secondary" href="/api/report/pdf">
              PDF exportieren
            </a>
          }
        />
        <section className="panel-card">
          <ProfileDetailGrid profile={report?.trainee} />
          <div className="inline-notice">
            <strong>Hinweis:</strong> Aenderungen an Name, Ausbildung, Betrieb oder Berufsschule koennen nur durch Ausbilder oder Admins vorgenommen werden.
          </div>
        </section>
        <ThemeSettingsPanel
          theme={theme}
          themePreference={themePreference}
          onToggleTheme={onToggleTheme}
          onSaveThemePreference={onSaveThemePreference}
        />
        <PasswordChangePanel onChangeOwnPassword={onChangeOwnPassword} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Profilpflege"
        title={role === "trainer" ? "Azubi-Stammdaten pflegen" : "Stammdaten verwalten"}
        subtitle="Aendere nur die fachlich relevanten Profilinformationen. Login-Daten und Rollen bleiben in der Verwaltung."
        actions={
          selectedProfile ? (
            <a className="button button-secondary" href={`/api/report/pdf/${selectedProfile.id}`}>
              PDF fuer Auswahl
            </a>
          ) : null
        }
      />

      <section className="profile-manager-layout">
        <article className="panel-card profile-picker">
          <PageHeader
            kicker="Auswahl"
            title={role === "trainer" ? "Zugeordnete Azubis" : "Azubi waehlen"}
            subtitle="Waehle einen Azubi aus und aktualisiere anschliessend dessen Stammdaten."
          />
          {targets.length ? (
            <div className="profile-target-list">
              {targets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  className={`profile-target-card${selectedId === target.id ? " active" : ""}`}
                  onClick={() => setSelectedId(target.id)}
                >
                  <strong>{target.name}</strong>
                  <span>{target.ausbildung || target.email || "Keine Zusatzdaten"}</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Keine Profile verfuegbar"
              description={role === "trainer" ? "Dir sind aktuell keine Azubis zugeordnet." : "Es sind noch keine Azubi-Profile vorhanden."}
            />
          )}
        </article>

        <article className="panel-card">
          <PageHeader
            kicker="Bearbeitung"
            title={selectedProfile ? `Stammdaten fuer ${selectedProfile.name}` : "Kein Profil ausgewaehlt"}
            subtitle="Diese Aenderungen wirken direkt auf Profilansicht, Dashboard und PDF-Export."
          />
          {selectedProfile ? (
            <>
              <div className="form-grid">
                <label>
                  Name
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <label>
                  Ausbildung
                  <input value={form.ausbildung} onChange={(event) => setForm({ ...form, ausbildung: event.target.value })} />
                </label>
                <label>
                  Betrieb
                  <input value={form.betrieb} onChange={(event) => setForm({ ...form, betrieb: event.target.value })} />
                </label>
                <label>
                  Berufsschule
                  <input value={form.berufsschule} onChange={(event) => setForm({ ...form, berufsschule: event.target.value })} />
                </label>
              </div>
              <div className="inline-notice">
                <strong>Hinweis:</strong> Nutzer koennen diese Profilfelder selbst nicht bearbeiten. Login-Daten, Rollen und Zuweisungen bleiben in der Verwaltung.
              </div>
              <div className="editor-footer">
                <PrimaryButton onClick={() => onSaveManagedProfile(selectedProfile.id, form)}>Stammdaten speichern</PrimaryButton>
              </div>
            </>
          ) : (
            <EmptyState title="Keine Auswahl" description="Waehle links einen Azubi aus, um seine Profildaten zu bearbeiten." />
          )}
        </article>
      </section>

      <ThemeSettingsPanel
        theme={theme}
        themePreference={themePreference}
        onToggleTheme={onToggleTheme}
        onSaveThemePreference={onSaveThemePreference}
      />
      <PasswordChangePanel onChangeOwnPassword={onChangeOwnPassword} />
    </div>
  );
}
