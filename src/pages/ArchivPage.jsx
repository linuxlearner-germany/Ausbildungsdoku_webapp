import React from "react";
import { PageHeader } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";

export function ArchivPage({ role, report, trainees }) {
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
        subtitle="Historie aller freigegebenen Tagesberichte mit Direktzugriff auf den PDF-Export."
        actions={
          role === "trainee" ? (
            <a className="button button-primary" href="/api/report/pdf">
              Gesamtes PDF laden
            </a>
          ) : trainees.length ? (
            <div className="page-actions">
              {trainees.slice(0, 2).map((trainee) => (
                <a key={trainee.id} className="button button-primary" href={`/api/report/pdf/${trainee.id}`}>
                  PDF {trainee.name}
                </a>
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
                    <a className="button button-secondary archive-pdf-button" href={`/api/report/pdf/${row.traineeId}`}>
                      PDF öffnen
                    </a>
                  )}
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="Noch kein Archiv" description="Freigegebene Berichte erscheinen automatisch im Archiv." />
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
