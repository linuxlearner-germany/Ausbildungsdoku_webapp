import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { PrimaryButton } from "../components/PrimaryButton";
import { isStaticDemo } from "../lib/runtime";
import { getAdminSectionLinks } from "../navigation/menuConfig.mjs";

function AdminSectionNav() {
  return <nav className="admin-section-nav" aria-label="Administration">{getAdminSectionLinks().map((item) => <NavLink key={item.key} to={item.to} className={({ isActive }) => `admin-section-link${isActive ? " active" : ""}`}>{item.label}</NavLink>)}</nav>;
}

function toForm(settings = {}) {
  return { enabled: Boolean(settings.enabled), host: settings.host || "", port: String(settings.port || 587), secure: Boolean(settings.secure), requireTls: settings.requireTls !== false, username: settings.username || "", password: "", clearPassword: false, from: settings.from || "", replyTo: settings.replyTo || "", passwordConfigured: Boolean(settings.passwordConfigured), source: settings.source || "environment" };
}

export function EmailRelaySettingsPage({ onLoadSettings, onSaveSettings, onTestSettings, onSuccess }) {
  const [form, setForm] = useState(toForm());
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const unavailable = isStaticDemo() || !onLoadSettings;

  useEffect(() => {
    if (unavailable) { setBusy(false); return undefined; }
    let active = true;
    onLoadSettings().then((settings) => { if (active) setForm(toForm(settings)); }).catch((loadError) => { if (active) setError(loadError.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [onLoadSettings, unavailable]);

  function update(values) { setForm((current) => ({ ...current, ...values })); }
  async function save(test = false) {
    setSaving(true); setError(""); setMessage("");
    try {
      const result = test ? await onTestSettings({ ...form, port: Number(form.port) }) : await onSaveSettings({ ...form, port: Number(form.port) });
      setForm(toForm(result.settings));
      const nextMessage = test ? "Test-E-Mail wurde an deine hinterlegte E-Mail-Adresse gesendet." : "Relay-Einstellungen gespeichert.";
      setMessage(nextMessage); onSuccess?.(nextMessage);
    } catch (saveError) { setError(saveError.message); } finally { setSaving(false); }
  }

  return <div className="page-stack">
    <PageHeader kicker="Administration" title="E-Mail-Relay" subtitle="Zentrale SMTP-Konfiguration für Passwort-Resets und Erinnerungen." />
    <AdminSectionNav />
    <article className="panel-card admin-form-card">
      {unavailable ? <p className="field-message">Die Relay-Verwaltung ist in der statischen Demo nicht verfügbar.</p> : null}
      {!unavailable && busy ? <p className="field-message">Relay-Einstellungen werden geladen...</p> : null}
      {!unavailable && !busy ? <>
        <div className="field-message">Quelle: {form.source === "database" ? "gespeicherte Admin-Einstellung" : "Server-Konfiguration (.env)"}</div>
        {error ? <div className="field-message error">{error}</div> : null}{message ? <div className="field-message success">{message}</div> : null}
        <div className="form-grid">
          <label className="form-check-label"><input type="checkbox" checked={form.enabled} onChange={(event) => update({ enabled: event.target.checked })} /> Relay aktivieren</label>
          <label>SMTP-Host<input value={form.host} onChange={(event) => update({ host: event.target.value })} placeholder="smtp.example.com" /></label>
          <label>Port<input type="number" min="1" max="65535" value={form.port} onChange={(event) => update({ port: event.target.value })} /></label>
          <label className="form-check-label"><input type="checkbox" checked={form.secure} onChange={(event) => update({ secure: event.target.checked })} /> SSL/TLS direkt verwenden (typisch Port 465)</label>
          <label className="form-check-label"><input type="checkbox" checked={form.requireTls} onChange={(event) => update({ requireTls: event.target.checked })} /> TLS erzwingen</label>
          <label>SMTP-Benutzername<input value={form.username} onChange={(event) => update({ username: event.target.value })} autoComplete="username" /></label>
          <label>SMTP-Passwort<input type="password" value={form.password} onChange={(event) => update({ password: event.target.value, clearPassword: false })} placeholder={form.passwordConfigured ? "Unverändert lassen" : "Passwort eingeben"} autoComplete="new-password" /></label>
          {form.passwordConfigured ? <label className="form-check-label"><input type="checkbox" checked={form.clearPassword} onChange={(event) => update({ clearPassword: event.target.checked, password: "" })} /> Gespeichertes Passwort entfernen</label> : null}
          <label>Absenderadresse<input value={form.from} onChange={(event) => update({ from: event.target.value })} placeholder="Ausbildungsdoku <noreply@example.com>" /></label>
          <label>Reply-To-Adresse (optional)<input type="email" value={form.replyTo} onChange={(event) => update({ replyTo: event.target.value })} placeholder="support@example.com" /></label>
        </div>
        <p className="field-message">Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt. Ein Wechsel des SESSION_SECRET erfordert eine erneute Eingabe.</p>
        <div className="page-actions"><PrimaryButton onClick={() => save(false)} disabled={saving}>{saving ? "Wird gespeichert..." : "Speichern"}</PrimaryButton><PrimaryButton variant="secondary" onClick={() => save(true)} disabled={saving}>{saving ? "Bitte warten..." : "Speichern und Test-E-Mail senden"}</PrimaryButton></div>
      </> : null}
    </article>
  </div>;
}
