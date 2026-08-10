import React, { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { PrimaryButton } from "../components/PrimaryButton";
import { apiClient } from "../lib/api-client";
import { assetUrl } from "../lib/runtime";

function PublicAuthCard({ title, subtitle, children }) {
  return (
    <div
      className="login-page"
      style={{ "--login-background-image": `url("${assetUrl("/Pictures/login-bg.png")}")` }}
    >
      <div className="login-card password-reset-card">
        <div className="login-brand">
          <BrandLogo size="large" />
          <div>
            <h1>{title}</h1>
            <small className="field-message">{subtitle}</small>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PasswordResetRequestPage() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await apiClient.post("/api/password-reset/request", { identifier });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message || "Die Anfrage konnte nicht verarbeitet werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicAuthCard title="Passwort vergessen?" subtitle="Wir senden dir einen einmaligen, zeitlich begrenzten Link.">
      {message ? (
        <div className="password-reset-result" role="status">
          <p>{message}</p>
          <Link className="btn btn-primary app-btn" to="/">Zur Anmeldung</Link>
        </div>
      ) : (
        <form className="login-form" onSubmit={submit}>
          <label className="form-label" htmlFor="reset-identifier">
            E-Mail oder Benutzername
            <input
              id="reset-identifier"
              className="form-control"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              required
              autoFocus
            />
          </label>
          {error ? <div className="field-message error" role="alert">{error}</div> : null}
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Anfrage wird gesendet..." : "Reset-Link anfordern"}
          </PrimaryButton>
          <Link className="login-secondary-link" to="/">Zurück zur Anmeldung</Link>
        </form>
      )}
    </PublicAuthCard>
  );
}

export function PasswordResetConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [form, setForm] = useState({ newPassword: "", newPasswordRepeat: "" });
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  if (!token) {
    return <Navigate to="/passwort-vergessen" replace />;
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (form.newPassword.length < 10) {
      setError("Das neue Passwort muss mindestens 10 Zeichen lang sein.");
      return;
    }
    if (form.newPassword !== form.newPasswordRepeat) {
      setError("Die beiden Passwörter stimmen nicht überein.");
      return;
    }

    setBusy(true);
    try {
      await apiClient.post("/api/password-reset/confirm", { token, ...form });
      setComplete(true);
    } catch (requestError) {
      setError(requestError.message || "Das Passwort konnte nicht geändert werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicAuthCard title="Neues Passwort" subtitle="Der Link kann nur einmal verwendet werden.">
      {complete ? (
        <div className="password-reset-result" role="status">
          <p>Dein Passwort wurde geändert.</p>
          <Link className="btn btn-primary app-btn" to="/">Jetzt anmelden</Link>
        </div>
      ) : (
        <form className="login-form" onSubmit={submit}>
          <label className="form-label" htmlFor="reset-new-password">
            Neues Passwort
            <input
              id="reset-new-password"
              className="form-control"
              type="password"
              minLength="10"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
              required
              autoFocus
            />
          </label>
          <label className="form-label" htmlFor="reset-new-password-repeat">
            Passwort wiederholen
            <input
              id="reset-new-password-repeat"
              className="form-control"
              type="password"
              minLength="10"
              autoComplete="new-password"
              value={form.newPasswordRepeat}
              onChange={(event) => setForm({ ...form, newPasswordRepeat: event.target.value })}
              required
            />
          </label>
          {error ? <div className="field-message error" role="alert">{error}</div> : null}
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Passwort wird geändert..." : "Passwort speichern"}
          </PrimaryButton>
          <Link className="login-secondary-link" to="/">Zurück zur Anmeldung</Link>
        </form>
      )}
    </PublicAuthCard>
  );
}
