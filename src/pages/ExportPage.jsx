import React, { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { EmptyState } from "../components/EmptyState";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusBadge } from "../components/StatusBadge";
import { downloadEntriesCsv, downloadReportPdf } from "../lib/reportExport";
import { apiUrl, assetUrl, isStaticDemo } from "../lib/runtime";

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

function ImportRowPreview({ row }) {
  return (
    <div className={`import-row-card${row.canImport ? "" : " invalid"}`}>
      <div className="import-row-head">
        <strong>Zeile {row.rowNumber}</strong>
        <StatusBadge status={row.canImport ? "submitted" : "invalid"} />
      </div>
      <div className="import-row-grid">
        <span>{row.dateFrom || "Kein Datum"}</span>
        <span>{row.weekLabel || "Kein Titel"}</span>
        <span>{row.betrieb || "-"}</span>
        <span>{row.schule || "-"}</span>
      </div>
      {row.errors?.length ? <p className="field-message error">{row.errors.join(" | ")}</p> : null}
      {row.warnings?.length ? <p className="field-message">{row.warnings.join(" | ")}</p> : null}
    </div>
  );
}

export function ExportPage({ report, onPreviewImport, onImportReports }) {
  const entries = report?.entries || [];
  const signedEntries = entries.filter((entry) => entry.status === "signed").length;
  const submittedEntries = entries.filter((entry) => entry.status === "submitted").length;
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importPayload, setImportPayload] = useState(null);
  const [error, setError] = useState("");
  const [csvError, setCsvError] = useState("");
  const [busy, setBusy] = useState(false);

  const previewSummary = useMemo(() => preview?.summary || { totalRows: 0, validRows: 0, invalidRows: 0 }, [preview]);

  function readErrorMessage(data, fallbackMessage) {
    if (typeof data?.error === "string") {
      return data.error;
    }

    if (data?.error?.message) {
      return data.error.message;
    }

    return fallbackMessage;
  }

  async function handlePreview() {
    if (!selectedFile) {
      setError("Bitte zuerst eine .xlsx- oder .csv-Datei auswählen.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const contentBase64 = await readFileAsBase64(selectedFile);
      const payload = {
        filename: selectedFile.name,
        contentBase64
      };

      const data = await onPreviewImport(payload);
      setImportPayload(payload);
      setPreview(data);
    } catch (previewError) {
      setPreview(null);
      setImportPayload(null);
      setError(previewError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!importPayload) {
      setError("Bitte zuerst eine Vorschau erzeugen.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await onImportReports(importPayload);
      setPreview(null);
      setImportPayload(null);
      setSelectedFile(null);
    } catch (importError) {
      setError(importError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCsvExport() {
    setBusy(true);
    setCsvError("");

    try {
      if (isStaticDemo()) {
        downloadEntriesCsv(entries, report?.trainee?.name || "azubi");
        return;
      }

      const response = await fetch(apiUrl("/api/report/csv"), {
        method: "GET",
        credentials: "same-origin"
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json") ? await response.json() : null;
        throw new Error(readErrorMessage(data, "CSV-Export konnte nicht gestartet werden."));
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = match?.[1] || "berichtsheft.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (exportError) {
      setCsvError(exportError.message || "CSV-Export konnte nicht gestartet werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Export"
        title="PDF-Export und Import"
        actions={
          <div className="page-actions">
            <PrimaryButton onClick={handleCsvExport} disabled={busy}>
              {busy ? "CSV wird erstellt..." : "CSV exportieren"}
            </PrimaryButton>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                if (isStaticDemo()) {
                  downloadReportPdf({
                    entries,
                    traineeName: report?.trainee?.name || "",
                    trainingTitle: report?.trainee?.ausbildung || ""
                  });
                  return;
                }

                window.location.href = apiUrl("/api/report/pdf");
              }}
            >
              PDF herunterladen
            </button>
          </div>
        }
      />
      <section className="stats-grid">
        <StatCard label="Tagesberichte" value={entries.length} note="Alle vorhandenen Tagesberichte" />
        <StatCard label="Freigegeben" value={signedEntries} note="Bereits signierte Berichte" />
        <StatCard label="In Prüfung" value={submittedEntries} note="Aktuell beim Ausbilder" />
        <StatCard label="Importierbar" value={previewSummary.validRows} note="Gültige Zeilen in der aktuellen Vorschau" />
      </section>

      <section className="reports-layout">
        <article className="panel-card">
          <PageHeader
            kicker="Export"
            title="Berichtsheft herunterladen"
          />
          {entries.length ? (
            <div className="export-panel">
              <div className="page-actions">
                <PrimaryButton onClick={handleCsvExport} disabled={busy}>
                  {busy ? "CSV wird erstellt..." : "Berichtsheft als CSV herunterladen"}
                </PrimaryButton>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    if (isStaticDemo()) {
                      downloadReportPdf({
                        entries,
                        traineeName: report?.trainee?.name || "",
                        trainingTitle: report?.trainee?.ausbildung || ""
                      });
                      return;
                    }

                    window.location.href = apiUrl("/api/report/pdf");
                  }}
                >
                  PDF herunterladen
                </button>
              </div>
              {csvError ? <div className="field-message error">{csvError}</div> : null}
            </div>
          ) : (
            <EmptyState title="Noch keine Berichte zum Export" />
          )}
        </article>

        <article className="panel-card">
          <PageHeader
            kicker="Import"
            title="Berichte aus Excel oder CSV übernehmen"
          />
          <div className="export-panel">
            <label>
              Datei auswählen
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] || null);
                  setPreview(null);
                  setImportPayload(null);
                  setError("");
                }}
              />
            </label>
            <div className="page-actions">
              <a className="button button-secondary" href={assetUrl("/report-import-template.csv")} download>
                Vorlage herunterladen
              </a>
              <PrimaryButton onClick={handlePreview} disabled={busy}>
                Vorschau laden
              </PrimaryButton>
            </div>
            {selectedFile ? <p>Ausgewählt: {selectedFile.name}</p> : null}
            {error ? <div className="field-message error">{error}</div> : null}
          </div>
        </article>
      </section>

      <section className="panel-card">
        <PageHeader
          kicker="Importvorschau"
          title="Erkannte Zeilen und Validierung"
          actions={
            preview ? (
              <PrimaryButton onClick={handleImport} disabled={busy || !preview.summary.validRows}>
                Import mit {preview.summary.validRows} Zeilen starten
              </PrimaryButton>
            ) : null
          }
        />
        {preview ? (
          <div className="page-stack">
            <div className="import-summary-grid">
              <div className="read-only-card">
                <span>Erkannte Zeilen</span>
                <strong>{preview.summary.totalRows}</strong>
              </div>
              <div className="read-only-card">
                <span>Gültig</span>
                <strong>{preview.summary.validRows}</strong>
              </div>
              <div className="read-only-card">
                <span>Nicht importierbar</span>
                <strong>{preview.summary.invalidRows}</strong>
              </div>
              <div className="read-only-card">
                <span>Zuordnung</span>
                <strong>{Object.keys(preview.mapping).join(", ")}</strong>
              </div>
            </div>
            <div className="import-row-list">
              {preview.rows.length ? preview.rows.map((row) => <ImportRowPreview key={`${row.rowNumber}-${row.dateFrom}-${row.weekLabel}`} row={row} />) : null}
            </div>
          </div>
        ) : (
          <EmptyState title="Noch keine Vorschau" />
        )}
      </section>
    </div>
  );
}
