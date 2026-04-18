import React from "react";
import { PageHeader } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { downloadReportPdf } from "../lib/reportExport";
import { apiUrl, isStaticDemo } from "../lib/runtime";

export function ArchivPage({ role, report, trainees }) {
  function exportPdf(trainee) {
    if (isStaticDemo()) {
      downloadReportPdf({
        entries: trainee.entries || [],
        traineeName: trainee.name,
        trainingTitle: trainee.ausbildung || ""
      });
      return;
    }

    window.location.href = apiUrl(`/api/report/pdf/${trainee.id}`);
  }

  const rows =
    role === "trainee"
      ? (report?.entries || []).filter((entry) => entry.status === "signed")
      : trainees.flatMap((trainee) =>
          trainee.entries.filter((entry) => entry.status === "signed").map((entry) => ({ ...entry, traineeName: trainee.name, traineeId: trainee.id }))
        );

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Archiv"
        title="Freigegebene Berichte und PDF-Archiv"
        actions={
          role === "trainee" ? (
            <button type="button" className="button button-primary" onClick={() => {
              if (isStaticDemo()) {
                downloadReportPdf({
                  entries: report?.entries || [],
                  traineeName: report?.trainee?.name || "",
                  trainingTitle: report?.trainee?.ausbildung || ""
                });
                return;
              }

              window.location.href = apiUrl("/api/report/pdf");
            }}>
              Gesamtes PDF laden
            </button>
          ) : trainees.length ? (
            <div className="page-actions">
              {trainees.slice(0, 2).map((trainee) => (
                <button key={trainee.id} type="button" className="button button-primary" onClick={() => exportPdf(trainee)}>
                  PDF {trainee.name}
                </button>
              ))}
            </div>
          ) : null
        }
      />
      <section className="panel-card">
        <div className="mobile-records">
          {rows.length ? (
            rows.map((row) => (
              <article key={row.id} className="mobile-record-card mobile-record-card-static">
                <div className="mobile-record-head">
                  <strong>{row.weekLabel || "Ohne Titel"}</strong>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mobile-record-body">
                  {role === "trainee" ? null : <small>Azubi: {row.traineeName}</small>}
                  <span>{row.dateFrom || "-"}</span>
                  <small>Freigabe durch: {row.signerName || "-"}</small>
                  {role === "trainee" ? null : (
                    <button
                      type="button"
                      className="button button-secondary archive-pdf-button"
                      onClick={() => exportPdf(trainees.find((trainee) => trainee.id === row.traineeId))}
                    >
                      PDF öffnen
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="Noch kein Archiv" />
          )}
        </div>
        <DataTable
          rowKey="id"
          rows={rows}
          columns={[
            ...(role === "trainee" ? [] : [{ key: "traineeName", label: "Azubi" }]),
            { key: "dateFrom", label: "Tag" },
            { key: "weekLabel", label: "Titel" },
            { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
            { key: "signerName", label: "Freigabe durch", render: (row) => row.signerName || "-" }
          ]}
        />
      </section>
    </div>
  );
}
