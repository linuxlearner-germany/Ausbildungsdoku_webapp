import React, { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { PrimaryButton } from "../components/PrimaryButton";
import { downloadPdfFromApi, downloadReportPdf } from "../lib/reportExport";
import { apiUrl, isStaticDemo } from "../lib/runtime";
import { formatLocalDate } from "../lib/date.mjs";

function formatDate(value) {
  return formatLocalDate(value, { day: "2-digit", month: "2-digit", year: "numeric" }) || "-";
}

export function ArchivPage({ role, report, trainees }) {
  const [pdfError, setPdfError] = useState("");

  async function exportPdf(trainee) {
    if (isStaticDemo()) {
      setPdfError("");
      await downloadReportPdf({
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

  async function exportOwnPdf() {
    if (isStaticDemo()) {
      setPdfError("");
      await downloadReportPdf({
        entries: report?.entries || [],
        traineeName: report?.trainee?.name || "",
        trainingTitle: report?.trainee?.ausbildung || ""
      });
      return;
    }

    try {
      setPdfError("");
      await downloadPdfFromApi(apiUrl("/api/report/pdf"), "berichtsheft.pdf");
    } catch (error) {
      setPdfError(error.message || "PDF konnte nicht geladen werden.");
    }
  }

  const rows =
    role === "trainee"
      ? (report?.entries || []).filter((entry) => entry.status === "signed")
      : trainees.flatMap((trainee) =>
          trainee.entries.filter((entry) => entry.status === "signed").map((entry) => ({ ...entry, traineeName: trainee.name, traineeId: trainee.id }))
        );
  const traineeView = role === "trainee";

  return (
    <div className="page-stack archive-page">
      <PageHeader
        kicker="Archiv"
        title="Freigegebene Berichte und PDF-Archiv"
        subtitle="Freigegebene Berichte einsehen und als PDF exportieren."
        actions={
          traineeView ? (
            <PrimaryButton type="button" className="archive-pdf-action" onClick={exportOwnPdf}>
              <svg className="button-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v10m0 0 3-3m-3 3L7 9M4 13v4h12v-4" /></svg>
              Gesamtes PDF herunterladen
            </PrimaryButton>
          ) : trainees.length ? (
            <div className="page-actions">
              {trainees.slice(0, 2).map((trainee) => (
                <PrimaryButton key={trainee.id} type="button" onClick={() => exportPdf(trainee)}>
                  PDF {trainee.name}
                </PrimaryButton>
              ))}
            </div>
          ) : null
        }
      />
      {pdfError ? <div className="field-message error report-error-banner">{pdfError}</div> : null}
      <section className="panel-card archive-table-panel">
        <DataTable
          rowKey="id"
          caption="Freigegebene Berichte"
          rows={rows}
          tableClassName={`archive-data-table${traineeView ? " archive-data-table-own" : " archive-data-table-managed"}`}
          emptyTitle="Noch keine freigegebenen Berichte"
          emptyDescription="Freigegebene Berichte erscheinen automatisch in diesem Archiv."
          columns={[
            ...(traineeView ? [] : [{ key: "traineeName", label: "Azubi", className: "archive-column-trainee", width: "20%" }]),
            { key: "dateFrom", label: "Tag", className: "archive-column-date", width: traineeView ? "17%" : "14%", render: (row) => formatDate(row.dateFrom) },
            { key: "weekLabel", label: "Titel", className: "archive-column-title", width: traineeView ? "36%" : "29%" },
            { key: "status", label: "Status", className: "archive-column-status", width: traineeView ? "20%" : "16%", render: (row) => <StatusBadge status={row.status} /> },
            { key: "signerName", label: "Freigabe durch", className: "archive-column-signer", width: traineeView ? "27%" : "21%", render: (row) => row.signerName || "-" }
          ]}
        />
      </section>
    </div>
  );
}
