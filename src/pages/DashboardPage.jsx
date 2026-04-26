import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { calculateWeightedAverage, formatGrade } from "../lib/grades";
import { downloadPdfFromApi, downloadReportPdf } from "../lib/reportExport";
import { apiUrl, isStaticDemo } from "../lib/runtime";

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

function summarizeAuditEvents(items) {
  const summary = new Map();
  for (const item of items || []) {
    summary.set(item.actionType, (summary.get(item.actionType) || 0) + 1);
  }
  return [...summary.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "de"))
    .slice(0, 5);
}

export function DashboardPage({ role, report, trainees, users, onLoadAuditLogs }) {
  const [pdfError, setPdfError] = useState("");
  const [auditState, setAuditState] = useState({ busy: false, error: "", items: [] });
  const allEntries = useMemo(() => trainees.flatMap((trainee) => trainee.entries || []), [trainees]);
  const traineeUsers = useMemo(() => users.filter((user) => user.role === "trainee"), [users]);
  const orphanedTrainees = useMemo(() => traineeUsers.filter((user) => !(user.trainerIds || []).length), [traineeUsers]);
  const auditSummary = useMemo(() => summarizeAuditEvents(auditState.items), [auditState.items]);

  useEffect(() => {
    let cancelled = false;

    if (role !== "admin" || typeof onLoadAuditLogs !== "function") {
      return undefined;
    }

    async function loadAuditOverview() {
      setAuditState({ busy: true, error: "", items: [] });
      try {
        const data = await onLoadAuditLogs({ page: 1, pageSize: 8 });
        if (!cancelled) {
          setAuditState({ busy: false, error: "", items: data.items || [] });
        }
      } catch (error) {
        if (!cancelled) {
          setAuditState({ busy: false, error: error.message || "Audit-Log konnte nicht geladen werden.", items: [] });
        }
      }
    }

    loadAuditOverview();
    return () => {
      cancelled = true;
    };
  }, [onLoadAuditLogs, role]);

  async function openPdfForTrainee(trainee) {
    if (isStaticDemo()) {
      setPdfError("");
      downloadReportPdf({
        entries: trainee.entries || [],
        traineeName: trainee.name,
        trainingTitle: trainee.ausbildung || ""
      });
      return;
    }

    try {
      setPdfError("");
      await downloadPdfFromApi(apiUrl(`/api/report/pdf/${trainee.id}`), `berichtsheft-${trainee.name || "azubi"}.pdf`);
    } catch (error) {
      setPdfError(error.message || "PDF konnte nicht geladen werden.");
    }
  }

  if (role === "trainee") {
    const entries = report?.entries || [];
    const grades = report?.grades || [];
    const reportingProgress = report?.reportingProgress || null;
    const latest = latestItems(entries);
    const openApprovals = entries.filter((entry) => entry.status === "submitted").length;
    const gradeAverage = calculateWeightedAverage(grades);
    return (
      <div className="page-stack">
        <PageHeader
          kicker="Dashboard"
          title="Mein Überblick"
          actions={<Link className="btn btn-primary app-btn" to="/berichte?view=write">Tagesbericht erstellen</Link>}
        />
        <section className="stats-grid">
          <StatCard label="Tagesberichte" value={entries.length} note="Gesamtzahl deiner Einträge" />
          <StatCard label="In Prüfung" value={openApprovals} note="Warten auf Freigabe" />
          <StatCard label="Signiert" value={entries.filter((entry) => entry.status === "signed").length} note="Freigegebene Tage" />
          <StatCard
            label="Fehlende Berichtstage"
            value={reportingProgress?.available ? reportingProgress.missingReportDays : "-"}
            note={reportingProgress?.available ? `Pflichtwerktage bis ${reportingProgress.calculationUntil}` : reportingProgress?.message || "Ausbildungsbeginn fehlt"}
          />
          <StatCard label="Notenschnitt" value={gradeAverage ? formatGrade(gradeAverage) : "-"} note="Gewichteter Durchschnitt" />
        </section>
        <section className="panel-card">
          <PageHeader kicker="Berichtsheftpflicht" title="Pflichtzeitraum" />
          {reportingProgress?.available ? (
            <div className="list-stack">
              <div className="list-row">
                <div>
                  <strong>Ausbildungsbeginn</strong>
                  <p>{reportingProgress.trainingStartDate || "-"}</p>
                </div>
              </div>
              <div className="list-row">
                <div>
                  <strong>Ausbildungsende</strong>
                  <p>{reportingProgress.trainingEndDate || "offen"}</p>
                </div>
              </div>
              <div className="list-row">
                <div>
                  <strong>Berechnet bis</strong>
                  <p>{reportingProgress.calculationUntil || "-"}</p>
                </div>
              </div>
              <div className="list-row">
                <div>
                  <strong>Pflichtwerktage</strong>
                  <p>{reportingProgress.requiredWorkdays}</p>
                </div>
                <div>
                  <strong>Vorhandene Berichtstage</strong>
                  <p>{reportingProgress.existingReportDays}</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title={reportingProgress?.message || "Ausbildungsbeginn nicht hinterlegt"} />
          )}
        </section>
        <section className="two-column-grid">
          <article className="panel-card">
            <PageHeader kicker="Aktivitäten" title="Letzte Einträge" />
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
              <EmptyState title="Noch keine Aktivitäten" />
            )}
          </article>
          <article className="panel-card">
            <PageHeader kicker="Schnellzugriffe" title="Direkte Aktionen" />
            <div className="quick-actions">
              <Link className="quick-action-card" to="/berichte?view=write">Berichte schreiben</Link>
              <Link className="quick-action-card" to="/berichte?view=calendar">Kalenderansicht</Link>
              <Link className="quick-action-card" to="/noten">Noten verwalten</Link>
              <Link className="quick-action-card" to="/freigaben">Freigabestatus prüfen</Link>
              <Link className="quick-action-card" to="/profil">Profil ansehen</Link>
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
          actions={<Link className="btn btn-primary app-btn" to="/freigaben">Freigaben öffnen</Link>}
        />
        {pdfError ? <div className="field-message error report-error-banner">{pdfError}</div> : null}
        <section className="stats-grid">
          <StatCard label="Azubis" value={trainees.length} note="Dir zugeordnete Personen" />
          <StatCard label="Offene Prüfungen" value={allEntries.filter((entry) => entry.status === "submitted").length} note="Zur Freigabe eingereicht" />
          <StatCard label="Signiert" value={allEntries.filter((entry) => entry.status === "signed").length} note="Freigegebene Berichte" />
          <StatCard label="Abgelehnt" value={allEntries.filter((entry) => entry.status === "rejected").length} note="Zur Nachbearbeitung zurückgegeben" />
        </section>
        <section className="two-column-grid">
          <article className="panel-card">
            <PageHeader kicker="Offene Fälle" title="Warten auf Freigabe" />
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
              <EmptyState title="Keine offenen Freigaben" />
            )}
          </article>
          <article className="panel-card">
            <PageHeader kicker="Schnellzugriffe" title="Arbeitsbereiche" />
            <div className="quick-actions">
              <Link className="quick-action-card" to="/freigaben">Freigaben bearbeiten</Link>
              <Link className="quick-action-card" to="/archiv">Archiv öffnen</Link>
              {trainees.slice(0, 2).map((trainee) => (
                <button key={trainee.id} type="button" className="quick-action-card" onClick={() => openPdfForTrainee(trainee)}>
                  PDF: {trainee.name}
                </button>
              ))}
            </div>
          </article>
        </section>
        <section className="panel-card">
          <PageHeader kicker="Azubi-Status" title="Zugeordnete Auszubildende" />
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
                      <button type="button" className="btn btn-outline-secondary trainer-pdf-button" onClick={() => openPdfForTrainee(trainee)}>
                        PDF
                      </button>
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
                      <EmptyState title="Noch keine Berichte" />
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Keine Azubis zugeordnet" />
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader kicker="Dashboard" title="Verwaltungsübersicht" />
      {pdfError ? <div className="field-message error report-error-banner">{pdfError}</div> : null}
      <section className="stats-grid">
        <StatCard label="Benutzer" value={users.length} note="Alle registrierten Konten" />
        <StatCard label="Azubis" value={traineeUsers.length} note="Aktive Auszubildende" />
        <StatCard label="Ausbilder" value={users.filter((user) => user.role === "trainer").length} note="Prüfende Nutzer" />
        <StatCard label="Admins" value={users.filter((user) => user.role === "admin").length} note="Verwaltungszugänge" />
        <StatCard label="Ohne Zuordnung" value={orphanedTrainees.length} note="Azubis ohne Ausbilder" />
        <StatCard label="Eingereicht" value={allEntries.filter((entry) => entry.status === "submitted").length} note="Warten auf Prüfung" />
        <StatCard label="Signiert" value={allEntries.filter((entry) => entry.status === "signed").length} note="Abgeschlossene Berichte" />
        <StatCard label="Nachbearbeitung" value={allEntries.filter((entry) => entry.status === "rejected").length} note="Zurückgegebene Berichte" />
      </section>
      <section className="two-column-grid">
        <article className="panel-card">
          <PageHeader kicker="System" title="Admin-Arbeitsbereiche" />
          <div className="quick-actions">
            <Link className="quick-action-card" to="/admin/users/new">Benutzer anlegen</Link>
            <Link className="quick-action-card" to="/admin/users">Benutzer verwalten</Link>
            <Link className="quick-action-card" to="/admin/assignments">Zuordnungen prüfen</Link>
            <Link className="quick-action-card" to="/admin/audit-log">Audit-Log öffnen</Link>
            <Link className="quick-action-card" to="/profil">Profil öffnen</Link>
          </div>
        </article>
        <article className="panel-card">
          <PageHeader kicker="Prüfung" title="Auffälligkeiten" />
          {orphanedTrainees.length ? (
            <div className="list-stack">
              {orphanedTrainees.slice(0, 5).map((user) => (
                <div key={user.id} className="list-row">
                  <div>
                    <strong>{user.name}</strong>
                    <p>{user.email}</p>
                  </div>
                  <span className="status-badge badge rounded-pill text-uppercase status-invalid">Kein Ausbilder</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine offenen Zuordnungsprobleme" />
          )}
        </article>
      </section>
      <section className="two-column-grid">
        <article className="panel-card">
          <PageHeader kicker="Audit-Log" title="Letzte Verwaltungsereignisse" />
          {auditState.error ? <div className="field-message error">{auditState.error}</div> : null}
          {auditState.busy ? <div className="field-message">Audit-Log wird geladen...</div> : null}
          {!auditState.busy && !auditState.items.length ? (
            <EmptyState title="Noch keine Audit-Einträge" />
          ) : null}
          {auditState.items.length ? (
            <div className="list-stack">
              {auditState.items.map((item) => (
                <div key={item.id} className="list-row">
                  <div>
                    <strong>{item.actionType}</strong>
                    <p>{item.summary}</p>
                  </div>
                  <small>{new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.createdAt))}</small>
                </div>
              ))}
            </div>
          ) : null}
        </article>
        <article className="panel-card">
          <PageHeader kicker="Verteilung" title="Audit-Typen" />
          {auditSummary.length ? (
            <div className="list-stack">
              {auditSummary.map(([actionType, count]) => (
                <div key={actionType} className="list-row">
                  <div>
                    <strong>{actionType}</strong>
                    <p>Vorkommen im aktuellen Ausschnitt</p>
                  </div>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine Audit-Auswertung verfügbar" />
          )}
        </article>
      </section>
    </div>
  );
}
