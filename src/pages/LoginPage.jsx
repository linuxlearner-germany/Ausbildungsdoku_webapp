import React, { useState } from "react";
import { useAuthContext } from "../context/AppContext";
import { PrimaryButton } from "../components/PrimaryButton";
import { assetUrl, isStaticDemo } from "../lib/runtime";

export function LoginPage() {
  const { login, busy } = useAuthContext();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setError("");
      await login(identifier, password);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src={assetUrl("/Pictures/wiweb-logo-kurz-blau_neu.png")} alt="WIWEB Logo" className="sidebar-logo" />
          <div>
            <p className="page-kicker mb-2">WIWEB</p>
            <h1>Ausbildungsdoku</h1>
            <p className="text-body-secondary mb-0">Digitale Tagesberichte, Freigaben und Noten in einem durchgaengigen Arbeitsbereich.</p>
            {isStaticDemo() ? <small className="field-message">Demo-Logins: admin, trainer, azubi.</small> : null}
          </div>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="form-label">
            E-Mail oder Benutzername
            <input className="form-control" value={identifier} onChange={(event) => setIdentifier(event.target.value)} type="text" required />
          </label>
          <label className="form-label">
            Passwort
            <input className="form-control" value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          {error ? <div className="field-message error">{error}</div> : null}
          <PrimaryButton disabled={busy} type="submit">
            {busy ? "Anmeldung..." : "Anmelden"}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}
