import React, { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { PrimaryButton } from "../components/PrimaryButton";

export function ProfilPage({ report, theme, onSaveProfile, onToggleTheme }) {
  const [form, setForm] = useState(report?.trainee || { name: "", ausbildung: "", betrieb: "", berufsschule: "" });

  useEffect(() => {
    setForm(report?.trainee || { name: "", ausbildung: "", betrieb: "", berufsschule: "" });
  }, [report]);

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Profil"
        title="Persönliche und betriebliche Daten"
        subtitle="Stammdaten, Ausbildungsinformationen und PDF-Export an einer Stelle."
        actions={
          <a className="button button-secondary" href="/api/report/pdf">
            PDF exportieren
          </a>
        }
      />
      <section className="panel-card">
        <div className="form-grid">
          <label>
            Name
            <input value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            Ausbildung
            <input value={form.ausbildung || ""} onChange={(event) => setForm({ ...form, ausbildung: event.target.value })} />
          </label>
          <label>
            Betrieb
            <input value={form.betrieb || ""} onChange={(event) => setForm({ ...form, betrieb: event.target.value })} />
          </label>
          <label>
            Berufsschule
            <input value={form.berufsschule || ""} onChange={(event) => setForm({ ...form, berufsschule: event.target.value })} />
          </label>
        </div>
        <div className="editor-footer">
          <PrimaryButton onClick={() => onSaveProfile(form)}>Profil speichern</PrimaryButton>
        </div>
      </section>
      <section className="panel-card">
        <PageHeader
          kicker="Darstellung"
          title="Farbschema"
          subtitle="Schalte zwischen heller und dunkler Ansicht um. Die Auswahl wird auf diesem Gerät gespeichert."
        />
        <div className="theme-panel">
          <div className="theme-state">
            <strong>Aktueller Modus</strong>
            <span>{theme === "dark" ? "Darkmode" : "Lightmode"}</span>
          </div>
          <PrimaryButton variant="secondary" onClick={onToggleTheme}>
            {theme === "dark" ? "Lightmode aktivieren" : "Darkmode aktivieren"}
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}
