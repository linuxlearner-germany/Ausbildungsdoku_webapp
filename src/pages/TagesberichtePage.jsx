import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { PrimaryButton } from "../components/PrimaryButton";
import { FilterBar } from "../components/FilterBar";
import { EmptyState } from "../components/EmptyState";
import { CalendarGrid } from "../components/CalendarGrid";
import { StatCard } from "../components/StatCard";

function buildEmptyEntry(date = "") {
  const label = date
    ? new Date(date).toLocaleDateString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "long"
      })
    : "Neuer Tagesbericht";

  return {
    id: "",
    weekLabel: `Bericht ${label}`,
    dateFrom: date,
    dateTo: date,
    betrieb: "",
    schule: "",
    status: "draft",
    signedAt: null,
    signerName: "",
    trainerComment: "",
    rejectionReason: ""
  };
}

function validateEntry(entry) {
  const errors = {};
  if (!entry.weekLabel?.trim()) errors.weekLabel = "Titel fehlt";
  if (!entry.dateFrom) errors.dateFrom = "Tag fehlt";
  if (!entry.betrieb?.trim() && !entry.schule?.trim()) errors.kind = "Betrieb oder Berufsschule ausfuellen";
  return errors;
}

function formatLongDate(date) {
  if (!date) return "Kein Tag ausgewaehlt";
  return new Date(date).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function ReportEditor({ entry, draft, selectedDate, onChange, onSave, onDelete, onSubmit, onCreateForDate }) {
  if (!draft) {
    return (
      <article className="panel-card editor-card">
        <EmptyState title="Kein Bericht ausgewaehlt" description="Waehle links einen Kalendertag oder einen bestehenden Tagesbericht aus." />
      </article>
    );
  }

  const errors = validateEntry(draft);
  const locked = entry?.status === "signed";
  const isExistingEntry = Boolean(entry?.id);

  return (
    <article className="panel-card editor-card">
      <PageHeader
        kicker={isExistingEntry ? "Bearbeitung" : "Neuer Eintrag"}
        title={isExistingEntry ? entry.weekLabel || "Tagesbericht" : `Bericht fuer ${formatLongDate(selectedDate || draft.dateFrom)}`}
        subtitle="Fokussiere dich auf einen Tag. Speichern und Einreichen erfolgen direkt aus dieser Ansicht."
        actions={
          <div className="page-actions">
            <StatusBadge status={entry?.status || "draft"} />
            {isExistingEntry ? (
              <PrimaryButton variant="ghost" onClick={() => onDelete(entry.id)} disabled={locked}>
                Loeschen
              </PrimaryButton>
            ) : (
              <PrimaryButton variant="secondary" onClick={() => onCreateForDate(draft.dateFrom || selectedDate || "")}>
                Entwurf anlegen
              </PrimaryButton>
            )}
          </div>
        }
      />

      <div className="report-editor-summary">
        <div className="report-meta-card">
          <span>Ausgewaehlter Tag</span>
          <strong>{formatLongDate(selectedDate || draft.dateFrom)}</strong>
        </div>
        <div className="report-meta-card">
          <span>Status</span>
          <strong>{entry?.status === "submitted" ? "Wartet auf Freigabe" : entry?.status === "signed" ? "Bereits signiert" : "In Bearbeitung"}</strong>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Titel
          <input value={draft.weekLabel} onChange={(event) => onChange("weekLabel", event.target.value)} disabled={locked} />
          {errors.weekLabel ? <span className="field-message error">{errors.weekLabel}</span> : null}
        </label>
        <label>
          Tag
          <input type="date" value={draft.dateFrom} onChange={(event) => onChange("dateFrom", event.target.value)} disabled={locked} />
          {errors.dateFrom ? <span className="field-message error">{errors.dateFrom}</span> : null}
        </label>
      </div>

      <div className="report-type-pills">
        <span className={`report-type-pill${draft.betrieb?.trim() ? " active" : ""}`}>Betrieb</span>
        <span className={`report-type-pill${draft.schule?.trim() ? " active" : ""}`}>Berufsschule</span>
      </div>

      <div className="form-grid">
        <label>
          Betrieb
          <textarea rows="10" value={draft.betrieb} onChange={(event) => onChange("betrieb", event.target.value)} disabled={locked} />
        </label>
        <label>
          Berufsschule
          <textarea rows="10" value={draft.schule} onChange={(event) => onChange("schule", event.target.value)} disabled={locked} />
        </label>
      </div>

      {errors.kind ? <div className="field-message error">{errors.kind}</div> : null}

      {entry?.trainerComment ? (
        <div className="inline-notice">
          <strong>Kommentar Ausbilder:</strong> {entry.trainerComment}
        </div>
      ) : null}

      {entry?.rejectionReason ? (
        <div className="inline-notice inline-notice-danger">
          <strong>Rueckmeldung:</strong> {entry.rejectionReason}
        </div>
      ) : null}

      <div className="editor-footer">
        <PrimaryButton onClick={() => onSave(draft)} disabled={locked}>Speichern</PrimaryButton>
        <PrimaryButton variant="secondary" onClick={() => onSubmit(draft)} disabled={locked || !!Object.keys(errors).length}>
          Zur Freigabe einreichen
        </PrimaryButton>
      </div>
    </article>
  );
}

export function TagesberichtePage({ report, initialView = "editor", onCreate, onSaveEntry, onDeleteEntry, onSubmitEntry }) {
  const entries = report?.entries || [];
  const defaultDate = entries[0]?.dateFrom || new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(initialView === "calendar" ? new Date().toISOString().slice(0, 10) : defaultDate);
  const [selectedId, setSelectedId] = useState(initialView === "editor" ? entries[0]?.id || null : null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const seed = initialView === "calendar" ? new Date() : new Date(defaultDate || new Date().toISOString().slice(0, 10));
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });
  const [draft, setDraft] = useState(null);

  const entryByDate = useMemo(() => new Map(entries.map((entry) => [entry.dateFrom, entry])), [entries]);
  const selectedEntry = useMemo(() => {
    if (selectedId) {
      return entries.find((entry) => entry.id === selectedId) || null;
    }
    return selectedDate ? entryByDate.get(selectedDate) || null : null;
  }, [entries, entryByDate, selectedDate, selectedId]);

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const matchesStatus = statusFilter === "all" ? true : entry.status === statusFilter;
        const needle = query.trim().toLowerCase();
        const matchesQuery = !needle
          ? true
          : [entry.weekLabel, entry.dateFrom, entry.betrieb, entry.schule].join(" ").toLowerCase().includes(needle);
        return matchesStatus && matchesQuery;
      }),
    [entries, query, statusFilter]
  );

  const monthlyEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (!entry.dateFrom) return false;
        const date = new Date(entry.dateFrom);
        return date.getFullYear() === visibleMonth.getFullYear() && date.getMonth() === visibleMonth.getMonth();
      }),
    [entries, visibleMonth]
  );

  useEffect(() => {
    if (!entries.length) {
      setDraft(buildEmptyEntry(selectedDate));
      return;
    }

    if (selectedEntry) {
      setDraft({ ...selectedEntry });
      return;
    }

    setDraft(selectedDate ? buildEmptyEntry(selectedDate) : null);
  }, [entries, selectedDate, selectedEntry]);

  useEffect(() => {
    if (!selectedDate && entries[0]?.dateFrom) {
      setSelectedDate(entries[0].dateFrom);
    }
  }, [entries, selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    const date = new Date(selectedDate);
    if (date.getFullYear() !== visibleMonth.getFullYear() || date.getMonth() !== visibleMonth.getMonth()) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [selectedDate, visibleMonth]);

  async function handleCreate(date) {
    const id = await onCreate(date);
    if (!id) {
      return null;
    }

    const targetDate = date || selectedDate || new Date().toISOString().slice(0, 10);
    setSelectedDate(targetDate);
    setSelectedId(id);
    return id;
  }

  async function handleSave(nextDraft) {
    if (!nextDraft) return;

    if (selectedEntry?.id) {
      await onSaveEntry(selectedEntry.id, nextDraft);
      setSelectedId(selectedEntry.id);
      setSelectedDate(nextDraft.dateFrom || selectedDate);
      return selectedEntry.id;
    }

    const id = await handleCreate(nextDraft.dateFrom || selectedDate);
    if (id) {
      await onSaveEntry(id, { ...nextDraft, id });
      setSelectedId(id);
      setSelectedDate(nextDraft.dateFrom || selectedDate);
      return id;
    }

    return null;
  }

  async function handleSubmit(nextDraft) {
    const entryId = (await handleSave(nextDraft)) || selectedEntry?.id || entryByDate.get(nextDraft.dateFrom || selectedDate || "")?.id;
    if (entryId) {
      await onSubmitEntry(entryId);
      setSelectedId(entryId);
    }
  }

  function handleSelectDate(date) {
    setSelectedDate(date);
    setSelectedId(entryByDate.get(date)?.id || null);
  }

  function handleChange(field, value) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if (field === "dateFrom") {
        next.dateTo = value;
        setSelectedDate(value);
      }
      return next;
    });
  }

  async function handleDelete(entryId) {
    await onDeleteEntry(entryId);
    setSelectedId(null);
  }

  const currentMonthMissing = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate() - monthlyEntries.length;

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Tagesberichte"
        title="Berichte schreiben, finden und im Kalender steuern"
        subtitle="Kalender, Tagesfokus und Editor liegen in einer gemeinsamen Arbeitsansicht. So fuehrst du Berichte schneller und ohne Medienbruch."
        actions={
          <div className="page-actions">
            <PrimaryButton variant="secondary" onClick={() => handleSelectDate(new Date().toISOString().slice(0, 10))}>
              Heute
            </PrimaryButton>
            <PrimaryButton onClick={() => handleCreate(selectedDate || new Date().toISOString().slice(0, 10))}>
              Bericht fuer Tag anlegen
            </PrimaryButton>
          </div>
        }
      />

      <section className="stats-grid report-day-stats">
        <StatCard label="Berichte gesamt" value={entries.length} note="Alle angelegten Tagesberichte" />
        <StatCard label="Im aktuellen Monat" value={monthlyEntries.length} note="Bereits dokumentierte Tage" />
        <StatCard label="Offen zur Freigabe" value={entries.filter((entry) => entry.status === "submitted").length} note="Warten auf Rueckmeldung" />
        <StatCard label="Luecken im Monat" value={Math.max(currentMonthMissing, 0)} note="Noch nicht dokumentierte Kalendertage" />
      </section>

      <section className="report-workspace">
        <div className="report-sidebar-column">
          <CalendarGrid
            entries={entries}
            month={visibleMonth}
            selectedDate={selectedDate}
            onChangeMonth={(offset) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))}
            onSelectDate={handleSelectDate}
          />

          <article className="panel-card report-focus-card">
            <PageHeader
              kicker="Tagesfokus"
              title={formatLongDate(selectedDate)}
              subtitle={selectedEntry ? "Fuer diesen Tag besteht bereits ein Bericht." : "Fuer diesen Tag existiert noch kein Bericht."}
            />
            {selectedEntry ? (
              <div className="report-focus-details">
                <div className="report-list-summary">
                  <strong>{selectedEntry.weekLabel || "Ohne Titel"}</strong>
                  <StatusBadge status={selectedEntry.status} />
                </div>
                <p>{selectedEntry.betrieb || selectedEntry.schule ? "Inhalt vorhanden und direkt bearbeitbar." : "Bericht angelegt, aber noch ohne inhaltlichen Schwerpunkt."}</p>
                <PrimaryButton variant="secondary" onClick={() => setSelectedId(selectedEntry.id)}>
                  Bericht oeffnen
                </PrimaryButton>
              </div>
            ) : (
              <EmptyState
                title="Noch kein Bericht"
                description="Lege direkt aus dem Kalender einen neuen Bericht fuer diesen Tag an."
                action={<PrimaryButton onClick={() => handleCreate(selectedDate)}>Bericht anlegen</PrimaryButton>}
              />
            )}
          </article>
        </div>

        <ReportEditor
          entry={selectedEntry}
          draft={draft}
          selectedDate={selectedDate}
          onChange={handleChange}
          onSave={handleSave}
          onDelete={handleDelete}
          onSubmit={handleSubmit}
          onCreateForDate={handleCreate}
        />
      </section>

      <section className="panel-card">
        <PageHeader
          kicker="Berichtsverwaltung"
          title="Schnellzugriff auf bestehende Eintraege"
          subtitle="Filtere nach Status, suche nach Stichwoertern und springe direkt in die Bearbeitung."
        />
        <FilterBar>
          <input placeholder="Suche nach Titel, Datum oder Inhalt" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Alle Status</option>
            <option value="draft">Entwurf</option>
            <option value="submitted">Eingereicht</option>
            <option value="signed">Signiert</option>
            <option value="rejected">Abgelehnt</option>
          </select>
        </FilterBar>

        {filteredEntries.length ? (
          <div className="report-list-grid">
            {filteredEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`report-list-item${selectedEntry?.id === entry.id ? " active" : ""}`}
                onClick={() => {
                  setSelectedId(entry.id);
                  setSelectedDate(entry.dateFrom || selectedDate);
                }}
              >
                <div className="report-list-summary">
                  <strong>{entry.weekLabel || "Ohne Titel"}</strong>
                  <StatusBadge status={entry.status} />
                </div>
                <div className="report-list-meta">
                  <span>{entry.dateFrom || "-"}</span>
                  <span>{entry.betrieb && entry.schule ? "Betrieb + Schule" : entry.betrieb ? "Betrieb" : entry.schule ? "Berufsschule" : "Noch ohne Inhalt"}</span>
                </div>
                {entry.trainerComment ? <p>{entry.trainerComment}</p> : <p>Direkt oeffnen, bearbeiten und bei Bedarf erneut einreichen.</p>}
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="Keine Berichte gefunden" description="Passe die Filter an oder lege fuer den ausgewaehlten Tag einen neuen Bericht an." />
        )}
      </section>
    </div>
  );
}
