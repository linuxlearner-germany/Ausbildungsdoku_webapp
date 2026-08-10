import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { PrimaryButton } from "../components/PrimaryButton";
import { isStaticDemo } from "../lib/runtime";
import { getLoginBackground, getLoginBackgroundUrl } from "../lib/login-background.mjs";

export function LoginPage({ login, busy, background = "standard" }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === "undefined" ? 1920 : window.innerWidth);
  const loginBackground = getLoginBackground(background);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

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
    <div
      className="login-page"
      style={{
        "--login-background-image": `url("${getLoginBackgroundUrl(background, viewportWidth)}")`,
        "--login-background-position": loginBackground.position || "center center"
      }}
    >
      <div className="login-card">
        <div className="login-brand">
          <BrandLogo size="large" />
          <div>
            <h1>WIWEB Berichtsheft</h1>
            <p className="login-product-subtitle">Digitaler Ausbildungsnachweis</p>
            {isStaticDemo() ? <small className="field-message">Demo-Logins: admin, trainer, azubi.</small> : null}
          </div>
        </div>
        <form className="login-form" onSubmit={handleSubmit} aria-describedby={error ? "login-error" : undefined}>
          <label className="form-label" htmlFor="login-identifier">
            E-Mail oder Benutzername
            <input
              id="login-identifier"
              className="form-control"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
              autoFocus
            />
          </label>
          <label className="form-label" htmlFor="login-password">
            Passwort
            <input
              id="login-password"
              className="form-control"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              required
            />
          </label>
          {error ? <div id="login-error" className="field-message error" role="alert" aria-live="assertive">{error}</div> : null}
          <PrimaryButton disabled={busy} type="submit" aria-busy={busy}>
            {busy ? "Anmeldung..." : "Anmelden"}
          </PrimaryButton>
          {!isStaticDemo() ? <Link className="login-secondary-link" to="/passwort-vergessen">Passwort vergessen?</Link> : null}
        </form>
      </div>
    </div>
  );
}
