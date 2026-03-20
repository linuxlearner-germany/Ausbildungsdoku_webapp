import React, { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DataTable } from "../components/DataTable";
import { PrimaryButton } from "../components/PrimaryButton";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";

export function FreigabenPage({ role, report, trainees, onSign, onReject, onComment }) {
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [traineeFilter, setTraineeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("date-asc");

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
        <PageHeader kicker="Freigaben" title="Status deiner Einreichungen" subtitle="Prüfverlauf und Signaturstatus deiner Tagesberichte." />
        <section className="panel-card">
          <div className="mobile-records">
            {entries.length ? (
              entries.map((entry) => (
                <article key={entry.id} className="mobile-record-card mobile-record-card-static">
                  <div className="mobile-record-head">
                    <strong>{entry.weekLabel || "Ohne Titel"}</strong>
                    <StatusBadge status={entry.status} />
                  </div>
                  <div className="mobile-record-body">
                    <span>{entry.dateFrom || "-"}</span>
                    <small>{entry.rejectionReason ? `Abgelehnt: ${entry.rejectionReason}` : formatSignature(entry)}</small>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="Keine Freigaben vorhanden" description="Sobald Berichte eingereicht werden, erscheinen sie hier." />
            )}
          </div>
          <DataTable
            rowKey="id"
            rows={entries}
            columns={[
              { key: "dateFrom", label: "Tag" },
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

  const rows = trainees.flatMap((trainee) =>
    trainee.entries.map((entry) => ({
      ...entry,
      traineeName: trainee.name,
      traineeId: trainee.id
    }))
  );
  const traineeOptions = [...trainees]
    .map((trainee) => ({ id: String(trainee.id), name: trainee.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

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

    if (periodFilter === "today") {
      return current.getTime() === startOfToday.getTime();
    }
    if (periodFilter === "week") {
      return current >= startOfWeek;
    }
    if (periodFilter === "month") {
      return current >= startOfMonth;
    }
    return true;
  };

  const sortRows = (items) =>
    [...items].sort((a, b) => {
      if (sortBy === "date-desc") {
        return String(b.dateFrom).localeCompare(String(a.dateFrom));
      }
      if (sortBy === "trainee-asc") {
        return String(a.traineeName).localeCompare(String(b.traineeName), "de") || String(a.dateFrom).localeCompare(String(b.dateFrom));
      }
      if (sortBy === "trainee-desc") {
        return String(b.traineeName).localeCompare(String(a.traineeName), "de") || String(a.dateFrom).localeCompare(String(b.dateFrom));
      }
      if (sortBy === "status") {
        return String(a.status).localeCompare(String(b.status), "de") || String(a.dateFrom).localeCompare(String(b.dateFrom));
      }
      return String(a.dateFrom).localeCompare(String(b.dateFrom));
    });

  const submittedRows = useMemo(() => sortRows(rows.filter((row) => row.status === "submitted")), [rows, sortBy]);
  const filteredRows = useMemo(
    () => sortRows(rows.filter((row) => {
        const matchesStatus = statusFilter === "all" ? true : row.status === statusFilter;
        const matchesTrainee = traineeFilter === "all" ? true : String(row.traineeId) === traineeFilter;
        const matchesPeriod = inPeriod(row.dateFrom);
        const needle = query.trim().toLowerCase();
        const matchesQuery = !needle ? true : [row.traineeName, row.weekLabel, row.dateFrom].join(" ").toLowerCase().includes(needle);
        return matchesStatus && matchesTrainee && matchesPeriod && matchesQuery;
      })),
    [periodFilter, query, rows, sortBy, statusFilter, traineeFilter]
  );

  const selectedEntry = filteredRows.find((row) => row.id === selected) || rows.find((row) => row.id === selected);

  return (
    <div className="page-stack">
      <PageHeader kicker="Freigaben" title="Prüfungen und Freigaben" subtitle="Eingereichte Berichte prüfen, kommentieren und freigeben." />
      <section className="stats-grid trainer-review-stats">
        <article className="stat-card">
          <span className="stat-label">Eingereicht</span>
          <strong className="stat-value">{submittedRows.length}</strong>
          <span className="stat-note">Aktuell zur Prüfung offen</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Azubis</span>
          <strong className="stat-value">{trainees.length}</strong>
          <span className="stat-note">Dir zugeordnet</span>
        </article>
      </section>
      <FilterBar>
        <input placeholder="Suche nach Azubi, Titel oder Datum" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={traineeFilter} onChange={(event) => setTraineeFilter(event.target.value)}>
          <option value="all">Alle Azubis</option>
          {traineeOptions.map((trainee) => (
            <option key={trainee.id} value={trainee.id}>
              {trainee.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="submitted">Eingereicht</option>
          <option value="rejected">Abgelehnt</option>
          <option value="signed">Signiert</option>
          <option value="draft">Entwurf</option>
          <option value="all">Alle Status</option>
        </select>
        <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
          <option value="all">Alle Zeitraeume</option>
          <option value="today">Heute</option>
          <option value="week">Diese Woche</option>
          <option value="month">Dieser Monat</option>
        </select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="date-asc">Datum aufsteigend</option>
          <option value="date-desc">Datum absteigend</option>
          <option value="trainee-asc">Azubi A-Z</option>
          <option value="trainee-desc">Azubi Z-A</option>
          <option value="status">Status</option>
        </select>
        <PrimaryButton
          variant="ghost"
          onClick={() => {
            setQuery("");
            setTraineeFilter("all");
            setStatusFilter("submitted");
            setPeriodFilter("all");
            setSortBy("date-asc");
          }}
        >
          Filter zurücksetzen
        </PrimaryButton>
      </FilterBar>
      <section className="panel-card">
        <PageHeader
          kicker="Eingereichte Berichte"
          title="Zur Prüfung eingereicht"
          subtitle="Diese Berichte warten aktuell auf eine Freigabe durch den Ausbilder."
        />
        <div className="mobile-records">
          {submittedRows.length ? (
            submittedRows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`mobile-record-card${selectedEntry?.id === row.id ? " selected" : ""}`}
                onClick={() => {
                  setSelected(row.id);
                  setComment(row.trainerComment || "");
                  setReason("");
                }}
              >
                <div className="mobile-record-head">
                  <strong>{row.traineeName}</strong>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mobile-record-body">
                  <span>{row.weekLabel || "Ohne Titel"}</span>
                  <small>{row.dateFrom || "-"}</small>
                </div>
              </button>
            ))
          ) : (
            <EmptyState title="Keine eingereichten Berichte" description="Aktuell gibt es keine Berichte mit dem Status Eingereicht." />
          )}
        </div>
        <DataTable
          rowKey="id"
          rows={submittedRows}
          onRowClick={(row) => {
            setSelected(row.id);
            setComment(row.trainerComment || "");
            setReason("");
          }}
          columns={[
            { key: "traineeName", label: "Azubi" },
            { key: "dateFrom", label: "Tag" },
            { key: "weekLabel", label: "Titel" },
            { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> }
          ]}
        />
      </section>
      <section className="reports-layout">
        <article className="panel-card">
          <div className="mobile-records">
            {filteredRows.length ? (
              filteredRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`mobile-record-card${selectedEntry?.id === row.id ? " selected" : ""}`}
                  onClick={() => {
                    setSelected(row.id);
                    setComment(row.trainerComment || "");
                    setReason("");
                  }}
                >
                  <div className="mobile-record-head">
                    <strong>{row.traineeName}</strong>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="mobile-record-body">
                    <span>{row.weekLabel || "Ohne Titel"}</span>
                    <small>{row.dateFrom || "-"}</small>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState title="Keine passenden Freigaben" description="Mit den aktuellen Filtern wurde kein Bericht gefunden." />
            )}
          </div>
          <DataTable
            rowKey="id"
            rows={filteredRows}
            onRowClick={(row) => {
              setSelected(row.id);
              setComment(row.trainerComment || "");
              setReason("");
            }}
            columns={[
              { key: "traineeName", label: "Azubi" },
              { key: "dateFrom", label: "Tag" },
              { key: "weekLabel", label: "Titel" },
              { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> }
            ]}
          />
        </article>
        <article className="panel-card">
          {selectedEntry ? (
            <>
              <PageHeader kicker="Prüfung" title={selectedEntry.weekLabel} subtitle={`${selectedEntry.traineeName} · ${selectedEntry.dateFrom}`} />
              <div className="mobile-detail-meta">
                <StatusBadge status={selectedEntry.status} />
                <a className="button button-secondary" href={`/api/report/pdf/${selectedEntry.traineeId}`}>
                  PDF öffnen
                </a>
              </div>
              <div className="review-panels">
                <div className="review-box">
                  <strong>Betrieb</strong>
                  <p>{selectedEntry.betrieb || "-"}</p>
                </div>
                <div className="review-box">
                  <strong>Berufsschule</strong>
                  <p>{selectedEntry.schule || "-"}</p>
                </div>
              </div>
              <label>
                Kommentar
                <textarea rows="4" value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              <label>
                Ablehnungsgrund
                <textarea rows="4" value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <div className="editor-footer">
                <PrimaryButton variant="secondary" onClick={() => onComment(selectedEntry.id, comment)}>Kommentar speichern</PrimaryButton>
                <PrimaryButton onClick={() => onSign(selectedEntry.id, comment)}>Freigeben</PrimaryButton>
                <PrimaryButton variant="ghost" onClick={() => onReject(selectedEntry.id, reason)}>Ablehnen</PrimaryButton>
              </div>
            </>
          ) : (
            <EmptyState title="Keine Prüfung ausgewählt" description="Wähle links einen Tagesbericht, um die Freigabe zu bearbeiten." />
          )}
        </article>
      </section>
    </div>
  );
}
