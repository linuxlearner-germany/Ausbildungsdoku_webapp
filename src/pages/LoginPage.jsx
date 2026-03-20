import React, { useState } from "react";
import { useAppContext } from "../context/AppContext";
import { PrimaryButton } from "../components/PrimaryButton";

export function LoginPage() {
  const { login, busy } = useAppContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setError("");
      await login(email, password);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/Pictures/wiweb-logo-kurz-blau_neu.png" alt="WIWEB Logo" className="sidebar-logo" />
          <div>
            <p className="page-kicker">Berichtsheft Portal</p>
            <h1>Willkommen im Ausbildungsportal</h1>
            <p>Melde dich an, um Tagesberichte zu führen, Freigaben zu prüfen und dein Archiv zu verwalten.</p>
          </div>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            E-Mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Passwort
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          {error ? <div className="field-message error">{error}</div> : null}
          <PrimaryButton disabled={busy} type="submit">
            {busy ? "Anmeldung..." : "Einloggen"}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}
