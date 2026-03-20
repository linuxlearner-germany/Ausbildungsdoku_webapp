import React from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { calculateWeightedAverage, formatGrade } from "../lib/grades";

function latestItems(entries) {
  return [...entries].sort((a, b) => String(b.dateFrom).localeCompare(String(a.dateFrom))).slice(0, 5);
}

function trainerSummary(trainee) {
  const entries = trainee.entries || [];
  return {
    submitted: entries.filter((entry) => entry.status === "submitted").length,
    signed: entries.filter((entry) => entry.status === "signed").length,
    rejected: entries.filter((entry) => entry.status === "rejected").length,
    latest: latestItems(entries)[0] || null
  };
}

export function DashboardPage({ role, report, trainees, users }) {
  if (role === "trainee") {
    const entries = report?.entries || [];
    const grades = report?.grades || [];
    const latest = latestItems(entries);
    const openApprovals = entries.filter((entry) => entry.status === "submitted").length;
    const gradeAverage = calculateWeightedAverage(grades);
    return (
      <div className="page-stack">
        <PageHeader
          kicker="Dashboard"
          title="Mein Überblick"
          subtitle="Status, letzte Aktivitäten und Schnellzugriffe für deine tägliche Berichtsheft-Führung."
          actions={<Link className="button button-primary" to="/tagesberichte">Tagesbericht erstellen</Link>}
        />
        <section className="stats-grid">
          <StatCard label="Tagesberichte" value={entries.length} note="Gesamtzahl deiner Einträge" />
          <StatCard label="In Prüfung" value={openApprovals} note="Warten auf Freigabe" />
          <StatCard label="Signiert" value={entries.filter((entry) => entry.status === "signed").length} note="Freigegebene Tage" />
          <StatCard label="Notenschnitt" value={gradeAverage ? formatGrade(gradeAverage) : "-"} note="Gewichteter Durchschnitt" />
        </section>
        <section className="two-column-grid">
          <article className="panel-card">
            <PageHeader kicker="Aktivitäten" title="Letzte Einträge" subtitle="Die zuletzt bearbeiteten Tagesberichte." />
            {latest.length ? (
              <div className="list-stack">
                {latest.map((entry) => (
                  <div key={entry.id} className="list-row">
                    <div>
                      <strong>{entry.weekLabel || "Ohne Titel"}</strong>
                      <p>{entry.dateFrom || "-"}</p>
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Noch keine Aktivitäten" description="Lege deinen ersten Tagesbericht an, um hier Inhalte zu sehen." />
            )}
          </article>
          <article className="panel-card">
            <PageHeader kicker="Schnellzugriffe" title="Direkte Aktionen" subtitle="Springe direkt in die wichtigsten Arbeitsbereiche." />
            <div className="quick-actions">
              <Link className="quick-action-card" to="/kalender">Kalender öffnen</Link>
              <Link className="quick-action-card" to="/noten">Noten verwalten</Link>
              <Link className="quick-action-card" to="/freigaben">Freigabestatus prüfen</Link>
              <Link className="quick-action-card" to="/profil">Profil bearbeiten</Link>
              <Link className="quick-action-card" to="/archiv">Archiv ansehen</Link>
            </div>
          </article>
        </section>
      </div>
    );
  }

  if (role === "trainer") {
    const allEntries = trainees.flatMap((trainee) => trainee.entries);
    const openEntries = allEntries
      .filter((entry) => entry.status === "submitted")
      .sort((a, b) => String(a.dateFrom).localeCompare(String(b.dateFrom)));
    return (
      <div className="page-stack">
        <PageHeader
          kicker="Dashboard"
          title="Freigabeübersicht"
          subtitle="Offene Prüfungen, Statusentwicklung und Schnellzugriffe für Ausbilder."
          actions={<Link className="button button-primary" to="/freigaben">Freigaben öffnen</Link>}
        />
        <section className="stats-grid">
          <StatCard label="Azubis" value={trainees.length} note="Dir zugeordnete Personen" />
          <StatCard label="Offene Prüfungen" value={allEntries.filter((entry) => entry.status === "submitted").length} note="Zur Freigabe eingereicht" />
          <StatCard label="Signiert" value={allEntries.filter((entry) => entry.status === "signed").length} note="Freigegebene Berichte" />
          <StatCard label="Abgelehnt" value={allEntries.filter((entry) => entry.status === "rejected").length} note="Zur Nachbearbeitung zurückgegeben" />
        </section>
        <section className="two-column-grid">
          <article className="panel-card">
            <PageHeader kicker="Offene Fälle" title="Warten auf Freigabe" subtitle="Die nächsten eingereichten Berichte, die geprüft werden sollten." />
            {openEntries.length ? (
              <div className="list-stack">
                {openEntries.slice(0, 6).map((entry) => {
                  const trainee = trainees.find((item) => item.entries.some((candidate) => candidate.id === entry.id));
                  return (
                    <div key={entry.id} className="list-row">
                      <div>
                        <strong>{trainee?.name || "Azubi"}</strong>
                        <p>{entry.weekLabel || "Ohne Titel"} · {entry.dateFrom || "-"}</p>
                      </div>
                      <StatusBadge status={entry.status} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="Keine offenen Freigaben" description="Aktuell liegen keine eingereichten Berichte zur Prüfung vor." />
            )}
          </article>
          <article className="panel-card">
            <PageHeader kicker="Schnellzugriffe" title="Arbeitsbereiche" subtitle="Direkter Zugriff auf Prüfung, Archiv und PDFs der zugeordneten Azubis." />
            <div className="quick-actions">
              <Link className="quick-action-card" to="/freigaben">Freigaben bearbeiten</Link>
              <Link className="quick-action-card" to="/archiv">Archiv öffnen</Link>
              {trainees.slice(0, 2).map((trainee) => (
                <a key={trainee.id} className="quick-action-card" href={`/api/report/pdf/${trainee.id}`}>
                  PDF: {trainee.name}
                </a>
              ))}
            </div>
          </article>
        </section>
        <section className="panel-card">
          <PageHeader kicker="Azubi-Status" title="Zugeordnete Auszubildende" subtitle="Status pro Azubi mit letzter Aktivität und aktuellem Prüfstand." />
          {trainees.length ? (
            <div className="trainer-overview-grid">
              {trainees.map((trainee) => {
                const summary = trainerSummary(trainee);
                return (
                  <article key={trainee.id} className="trainer-card">
                    <div className="trainer-card-head">
                      <div>
                        <strong>{trainee.name}</strong>
                        <p>{trainee.ausbildung || trainee.email}</p>
                      </div>
                      <a className="button button-secondary trainer-pdf-button" href={`/api/report/pdf/${trainee.id}`}>
                        PDF
                      </a>
                    </div>
                    <div className="trainer-card-stats">
                      <span>Offen: {summary.submitted}</span>
                      <span>Signiert: {summary.signed}</span>
                      <span>Abgelehnt: {summary.rejected}</span>
                    </div>
                    {summary.latest ? (
                      <div className="trainer-card-latest">
                        <div>
                          <strong>Letzte Aktivität</strong>
                          <p>{summary.latest.weekLabel || "Ohne Titel"} · {summary.latest.dateFrom || "-"}</p>
                        </div>
                        <StatusBadge status={summary.latest.status} />
                      </div>
                    ) : (
                      <EmptyState title="Noch keine Berichte" description="Für diesen Azubi wurden noch keine Tagesberichte angelegt." />
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Keine Azubis zugeordnet" description="Sobald ein Azubi dir zugewiesen ist, erscheint er hier mit seinem Status." />
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader kicker="Dashboard" title="Verwaltungsübersicht" subtitle="Nutzerbestand, Rollenverteilung und zentrale Verwaltungsaktionen." />
      <section className="stats-grid">
        <StatCard label="Benutzer" value={users.length} note="Alle registrierten Konten" />
        <StatCard label="Azubis" value={users.filter((user) => user.role === "trainee").length} note="Aktive Auszubildende" />
        <StatCard label="Ausbilder" value={users.filter((user) => user.role === "trainer").length} note="Prüfende Nutzer" />
        <StatCard label="Admins" value={users.filter((user) => user.role === "admin").length} note="Verwaltungszugänge" />
      </section>
    </div>
  );
}
