import React from "react";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { EmptyState } from "../components/EmptyState";

export function ExportPage({ report }) {
  const entries = report?.entries || [];
  const signedEntries = entries.filter((entry) => entry.status === "signed").length;
  const submittedEntries = entries.filter((entry) => entry.status === "submitted").length;

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Export"
        title="PDF-Export"
        subtitle="Lade dein komplettes Berichtsheft als PDF herunter."
        actions={
          <a className="button button-primary" href="/api/report/pdf">
            PDF herunterladen
          </a>
        }
      />
      <section className="stats-grid">
        <StatCard label="Tagesberichte" value={entries.length} note="Alle vorhandenen Tagesberichte" />
        <StatCard label="Freigegeben" value={signedEntries} note="Bereits signierte Berichte" />
        <StatCard label="In Prüfung" value={submittedEntries} note="Aktuell beim Ausbilder" />
      </section>
      <section className="panel-card">
        {entries.length ? (
          <div className="export-panel">
            <strong>Berichtsheft als PDF</strong>
            <p>Das PDF enthält nur signierte Tagesberichte, gruppiert in 5er-Bloecken, plus ein zusaetzliches Unterschriftsblatt am Ende.</p>
            <a className="button button-secondary" href="/api/report/pdf">
              PDF herunterladen
            </a>
          </div>
        ) : (
          <EmptyState title="Noch keine Berichte zum Export" description="Sobald Tagesberichte vorhanden sind, kannst du hier dein PDF herunterladen." />
        )}
      </section>
    </div>
  );
}
