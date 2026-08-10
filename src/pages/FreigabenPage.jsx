import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable } from "../components/DataTable";
import { PrimaryButton } from "../components/PrimaryButton";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { downloadPdfFromApi, downloadReportPdf } from "../lib/reportExport";
import { apiUrl, isStaticDemo } from "../lib/runtime";

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE");
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("de-DE");
}

function statusText(status) {
  if (status === "submitted") return "Eingereicht";
  if (status === "signed") return "Signiert";
  if (status === "rejected") return "Nachbearbeitung";
  if (status === "draft") return "Entwurf";
  return status || "-";
}

function summarizeBatchFailures(failures = []) {
  if (!failures.length) {
    return "";
  }

  const preview = failures.slice(0, 3).map((item) => item.error).join(" | ");
  return failures.length > 3 ? `${preview} | weitere ${failures.length - 3}` : preview;
}

export function FreigabenPage({ role, report, trainees, onSign, onReject, onComment, onProcessEntries }) {
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [traineeFilter, setTraineeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [busyAction, setBusyAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [pdfError, setPdfError] = useState("");

  if (role === "trainee") {
    const entries = report?.entries || [];
    const formatSignature = (entry) => {
      if (!entry.signerName || !entry.signedAt) {
        return "-";
      }

      return `Signiert von ${entry.signerName} am ${new Date(entry.signedAt).toLocaleString("de-DE")}`;
    };

    return (
      <div className="page-stack">
        <PageHeader kicker="Freigaben" title="Status deiner Einreichungen" />
        <section className="panel-card">
          <DataTable
            rowKey="id"
            rows={entries}
            columns={[
              { key: "dateFrom", label: "Tag", render: (row) => formatDate(row.dateFrom) },
              { key: "weekLabel", label: "Titel" },
              { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
              {
                key: "signature",
                label: "Signatur",
                render: (row) => (row.rejectionReason ? `Abgelehnt: ${row.rejectionReason}` : formatSignature(row))
              }
            ]}
          />
        </section>
      </div>
    );
  }

  const rows = useMemo(
    () =>
      trainees.flatMap((trainee) =>
        trainee.entries.map((entry) => ({
          ...entry,
          traineeName: trainee.name,
          traineeId: trainee.id
        }))
      ),
    [trainees]
  );
  const traineeOptions = useMemo(
    () =>
      [...trainees]
        .map((trainee) => ({ id: String(trainee.id), name: trainee.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    [trainees]
  );

  const inPeriod = (dateValue) => {
    if (periodFilter === "all" || !dateValue) {
      return true;
    }

    const today = new Date();
    const current = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(current.getTime())) {
      return true;
    }

    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(startOfToday);
    const weekDay = startOfWeek.getDay() || 7;
    startOfWeek.setDate(startOfWeek.getDate() - weekDay + 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    if (periodFilter === "today") return current.getTime() === startOfToday.getTime();
    if (periodFilter === "week") return current >= startOfWeek;
    if (periodFilter === "month") return current >= startOfMonth;
    return true;
  };

  const sortRows = (items) =>
    [...items].sort((a, b) => {
      if (sortBy === "date-asc") {
        return String(a.dateFrom).localeCompare(String(b.dateFrom));
      }
      if (sortBy === "trainee-asc") {
        return String(a.traineeName).localeCompare(String(b.traineeName), "de") || String(b.dateFrom).localeCompare(String(a.dateFrom));
      }
      if (sortBy === "trainee-desc") {
        return String(b.traineeName).localeCompare(String(a.traineeName), "de") || String(b.dateFrom).localeCompare(String(a.dateFrom));
      }
      if (sortBy === "status") {
        return String(a.status).localeCompare(String(b.status), "de") || String(b.dateFrom).localeCompare(String(a.dateFrom));
      }
      return String(b.dateFrom).localeCompare(String(a.dateFrom));
    });

  const filteredRows = useMemo(
    () =>
      sortRows(
        rows.filter((row) => {
          const matchesStatus = statusFilter === "all" ? true : row.status === statusFilter;
          const matchesTrainee = traineeFilter === "all" ? true : String(row.traineeId) === traineeFilter;
          const matchesPeriod = inPeriod(row.dateFrom);
          const needle = query.trim().toLowerCase();
          const matchesQuery = !needle ? true : [row.traineeName, row.weekLabel, row.dateFrom, row.betrieb, row.schule].join(" ").toLowerCase().includes(needle);
          return matchesStatus && matchesTrainee && matchesPeriod && matchesQuery;
        })
      ),
    [periodFilter, query, rows, sortBy, statusFilter, traineeFilter]
  );

  const pendingCount = rows.filter((row) => row.status === "submitted").length;
  const selectableFilteredRows = useMemo(
    () => filteredRows.filter((row) => row.status === "submitted"),
    [filteredRows]
  );
  const selectableFilteredIds = useMemo(
    () => selectableFilteredRows.map((row) => row.id),
    [selectableFilteredRows]
  );
  const selectedEntry = useMemo(
    () => filteredRows.find((row) => row.id === selected) || null,
    [filteredRows, selected]
  );
  const canEditFeedback = selectedEntry?.status === "submitted";
  const commentChanged = canEditFeedback && comment.trim() !== String(selectedEntry?.trainerComment || "").trim();

  useEffect(() => {
    if (!filteredRows.length) {
      setSelected(null);
      return;
    }

    if (!selected || !filteredRows.some((row) => row.id === selected)) {
      setSelected(filteredRows[0].id);
    }
  }, [filteredRows, selected]);

  useEffect(() => {
    if (!selectedEntry) {
      setComment("");
      setReason("");
      setActionError("");
      return;
    }

    setComment(selectedEntry.trainerComment || "");
    setReason(selectedEntry.rejectionReason || "");
    setActionError("");
  }, [selectedEntry?.id, selectedEntry?.trainerComment, selectedEntry?.rejectionReason]);

  useEffect(() => {
    const allowedIds = new Set(selectableFilteredIds);
    setSelectedIds((current) => current.filter((entryId) => allowedIds.has(entryId)));
  }, [selectableFilteredIds]);

  async function runAction(type, handler) {
    setBusyAction(type);
    setActionError("");
    try {
      await handler();
    } catch (error) {
      setActionError(error.message || "Aktion konnte nicht ausgeführt werden.");
    } finally {
      setBusyAction("");
    }
  }

  async function runDecisionAction(type, handler) {
    const currentIndex = selectableFilteredRows.findIndex((entry) => entry.id === selectedEntry?.id);
    const nextOpenEntry = currentIndex >= 0
      ? [...selectableFilteredRows.slice(currentIndex + 1), ...selectableFilteredRows.slice(0, currentIndex)]
        .find((entry) => entry.id !== selectedEntry.id)
      : selectableFilteredRows[0];

    setBusyAction(type);
    setActionError("");
    try {
      await handler();
      setSelected(nextOpenEntry?.id || null);
    } catch (error) {
      setActionError(error.message || "Aktion konnte nicht ausgeführt werden.");
    } finally {
      setBusyAction("");
    }
  }

  async function runBatchAction(type, action, payload) {
    if (!selectedIds.length || !onProcessEntries) {
      return;
    }

    setBusyAction(type);
    setActionError("");
    try {
      const result = await onProcessEntries(action, selectedIds, payload);
      setSelectedIds([]);
      if (result.failed?.length) {
        setActionError(`Nicht verarbeitet: ${summarizeBatchFailures(result.failed)}`);
      }
    } catch (error) {
      setActionError(error.message || "Sammelaktion konnte nicht ausgeführt werden.");
    } finally {
      setBusyAction("");
    }
  }

  function toggleSelection(entryId) {
    setSelectedIds((current) =>
      current.includes(entryId)
        ? current.filter((value) => value !== entryId)
        : [...current, entryId]
    );
  }

  async function handlePdfExport() {
    if (!selectedEntry) {
      return;
    }

    const trainee = trainees.find((item) => item.id === selectedEntry.traineeId);
    if (!trainee) {
      return;
    }

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
      await downloadPdfFromApi(apiUrl(`/api/report/pdf/${selectedEntry.traineeId}`), `berichtsheft-${trainee.name || "azubi"}.pdf`);
    } catch (error) {
      setPdfError(error.message || "PDF konnte nicht geladen werden.");
    }
  }

  return (
    <div className={`page-stack${role === "trainer" ? " trainer-approvals-page" : ""}`}>
      <PageHeader
        kicker="Freigaben"
        title="Prüfungen und Freigaben"
      />
      {pdfError ? <div className="field-message error report-error-banner">{pdfError}</div> : null}

      <section className="approval-summary">
        <article className="approval-summary-item">
          <span>Offen eingereicht</span>
          <strong>{pendingCount}</strong>
          <small>Berichte mit Status Eingereicht</small>
        </article>
        <article className="approval-summary-item">
          <span>Aktuelle Treffer</span>
          <strong>{filteredRows.length}</strong>
        </article>
      </section>

      <section className="approval-layout">
        <article className="panel-card approval-list-panel">
          <div className="approval-list-head">
            <div>
              <p className="page-kicker">Queue</p>
              <h3>Berichte zur Prüfung</h3>
            </div>
            <span className="approval-count">{filteredRows.length}</span>
          </div>

          <FilterBar className="approval-filter-bar" label="Freigaben filtern">
            <input type="search" aria-label="Freigaben durchsuchen" placeholder="Suche nach Azubi, Titel oder Inhalt" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label="Nach Azubi filtern" value={traineeFilter} onChange={(event) => setTraineeFilter(event.target.value)}>
              <option value="all">Alle Azubis</option>
              {traineeOptions.map((trainee) => (
                <option key={trainee.id} value={trainee.id}>
                  {trainee.name}
                </option>
              ))}
            </select>
            <select aria-label="Nach Status filtern" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="submitted">Eingereicht</option>
              <option value="rejected">Nachbearbeitung</option>
              <option value="signed">Signiert</option>
              <option value="draft">Entwurf</option>
              <option value="all">Alle Status</option>
            </select>
            <select aria-label="Nach Zeitraum filtern" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
              <option value="all">Alle Zeitraeume</option>
              <option value="today">Heute</option>
              <option value="week">Diese Woche</option>
              <option value="month">Dieser Monat</option>
            </select>
            <select aria-label="Sortierung" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="date-desc">Neueste zuerst</option>
              <option value="date-asc">Aelteste zuerst</option>
              <option value="trainee-asc">Azubi A-Z</option>
              <option value="trainee-desc">Azubi Z-A</option>
              <option value="status">Nach Status</option>
            </select>
            <PrimaryButton
              variant="ghost"
              onClick={() => {
                setQuery("");
                setTraineeFilter("all");
                setStatusFilter("submitted");
                setPeriodFilter("all");
                setSortBy("date-desc");
              }}
            >
              Zurücksetzen
            </PrimaryButton>
          </FilterBar>

          {selectableFilteredIds.length ? (
            <div className="approval-bulk-bar">
              <label className="selection-check">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === selectableFilteredIds.length}
                  onChange={() =>
                    setSelectedIds((current) =>
                      current.length === selectableFilteredIds.length ? [] : selectableFilteredIds
                    )
                  }
                />
                <span>Alle auswählen</span>
              </label>
              <PrimaryButton
                variant="ghost"
                onClick={() => setSelectedIds([])}
                disabled={!selectedIds.length || Boolean(busyAction)}
              >
                Auswahl aufheben
              </PrimaryButton>
              {selectedIds.length ? (
                <>
                  <PrimaryButton
                    onClick={() => runBatchAction("batch-sign", "sign", {})}
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction === "batch-sign" ? "Freigabe läuft..." : `${selectedIds.length} Berichte freigeben`}
                  </PrimaryButton>
                  <PrimaryButton
                    variant="ghost"
                    onClick={() => runBatchAction("batch-reject", "reject", { reason })}
                    disabled={Boolean(busyAction) || !reason.trim()}
                  >
                    {busyAction === "batch-reject" ? "Rückgabe läuft..." : `${selectedIds.length} Berichte zurückgeben`}
                  </PrimaryButton>
                </>
              ) : null}
            </div>
          ) : null}

          {filteredRows.length ? (
            <div className="approval-list">
              {filteredRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`approval-list-row${selectedEntry?.id === row.id ? " active" : ""}`}
                  onClick={() => setSelected(row.id)}
                >
                  <div className="approval-row-main">
                    {row.status === "submitted" ? (
                      <label
                        className="selection-check selection-check-compact"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={() => toggleSelection(row.id)}
                        />
                        <span>Auswählen</span>
                      </label>
                    ) : null}
                    <div className="approval-row-copy">
                      <strong>{row.weekLabel || "Ohne Titel"}</strong>
                      <span>{row.traineeName}</span>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="approval-row-meta">
                    <span>{formatDate(row.dateFrom)}</span>
                    <span>{row.updatedAt ? `Aktualisiert ${formatDateTime(row.updatedAt)}` : "Tagesbericht"}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              size="compact"
              title="Keine passenden Freigaben"
              description="Aktuell entsprechen keine Berichte den gewählten Filtern."
            />
          )}
        </article>

        <article className="panel-card approval-detail-panel">
          {selectedEntry ? (
            <>
              <div className="approval-detail-head">
                <div>
                  <p className="page-kicker">Prüfansicht</p>
                  <h3>{selectedEntry.weekLabel || "Ohne Titel"}</h3>
                  <p>{selectedEntry.traineeName} · {formatDate(selectedEntry.dateFrom)}</p>
                </div>
                <div className="approval-detail-actions">
                  <StatusBadge status={selectedEntry.status} />
                  <PrimaryButton type="button" variant="secondary" onClick={handlePdfExport}>
                    PDF öffnen
                  </PrimaryButton>
                </div>
              </div>

              {actionError ? <div className="field-message error report-error-banner">{actionError}</div> : null}

              <div className="approval-meta-grid">
                <div className="report-meta-card">
                  <span>Azubi</span>
                  <strong>{selectedEntry.traineeName}</strong>
                </div>
                <div className="report-meta-card">
                  <span>Status</span>
                  <strong>{statusText(selectedEntry.status)}</strong>
                </div>
                <div className="report-meta-card">
                  <span>Tag</span>
                  <strong>{formatDate(selectedEntry.dateFrom)}</strong>
                </div>
                <div className="report-meta-card">
                  <span>Letzte Signatur</span>
                  <strong>{selectedEntry.signedAt ? formatDateTime(selectedEntry.signedAt) : "-"}</strong>
                </div>
              </div>

              <div className="approval-content-grid">
                <section className="approval-content-card">
                  <div className="approval-section-head">
                    <strong>Betrieb</strong>
                    <small>Arbeitsinhalte des Tages</small>
                  </div>
                  <p>{selectedEntry.betrieb || "Keine Inhalte für Betrieb hinterlegt."}</p>
                </section>
                <section className="approval-content-card">
                  <div className="approval-section-head">
                    <strong>Berufsschule</strong>
                    <small>Schulische Inhalte des Tages</small>
                  </div>
                  <p>{selectedEntry.schule || "Keine Inhalte für Berufsschule hinterlegt."}</p>
                </section>
              </div>

              <div className="approval-feedback-grid approval-feedback-separated">
                <section className="approval-feedback-section">
                  <label htmlFor="trainer-comment">Kommentar zum Bericht</label>
                  <p className="approval-feedback-hint">Optional speichern. Der Bericht bleibt eingereicht und kann danach freigegeben oder zurückgegeben werden.</p>
                  <textarea
                    id="trainer-comment"
                    rows="5"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    disabled={Boolean(busyAction) || !canEditFeedback}
                  />
                  <PrimaryButton
                    variant="secondary"
                    onClick={() => runAction("comment", () => onComment(selectedEntry.id, comment))}
                    disabled={Boolean(busyAction) || !canEditFeedback || !commentChanged}
                  >
                    {busyAction === "comment" ? "Speichert..." : "Kommentar speichern"}
                  </PrimaryButton>
                </section>
                <section className="approval-feedback-section approval-return-section">
                  <label htmlFor="return-reason">Grund für die Rückgabe</label>
                  <p className="approval-feedback-hint">Nur die ausdrückliche Rückgabe setzt den Bericht auf Nachbearbeitung.</p>
                  <textarea
                    id="return-reason"
                    rows="5"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={Boolean(busyAction) || !canEditFeedback}
                  />
                  <PrimaryButton
                    variant="ghost"
                    onClick={() => runDecisionAction("reject", () => onReject(selectedEntry.id, reason))}
                    disabled={Boolean(busyAction) || !reason.trim() || !canEditFeedback}
                  >
                    {busyAction === "reject" ? "Rückgabe läuft..." : "Zur Nachbearbeitung zurückgeben"}
                  </PrimaryButton>
                </section>
              </div>

              {!canEditFeedback ? (
                <div className="inline-notice">
                  <strong>Hinweis:</strong> Kommentare und Rückgabegründe können nur bei eingereichten Berichten bearbeitet werden.
                </div>
              ) : null}

              <div className="approval-action-bar">
                <span className="approval-decision-label">Entscheidung</span>
                <PrimaryButton
                  onClick={() => runDecisionAction("sign", () => onSign(selectedEntry.id))}
                  disabled={Boolean(busyAction) || !canEditFeedback}
                >
                  {busyAction === "sign" ? "Freigabe läuft..." : "Freigeben"}
                </PrimaryButton>
              </div>
            </>
          ) : (
            <div className="approval-empty">
              <EmptyState
                size="compact"
                title="Kein Bericht ausgewählt"
                description="Wähle links einen Bericht aus, um Details anzuzeigen."
              />
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
