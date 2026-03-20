import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { PrimaryButton } from "../components/PrimaryButton";
import { FilterBar } from "../components/FilterBar";
import { EmptyState } from "../components/EmptyState";

function validateEntry(entry) {
  const errors = {};
  if (!entry.weekLabel?.trim()) errors.weekLabel = "Titel fehlt";
  if (!entry.dateFrom) errors.dateFrom = "Tag fehlt";
  if (!entry.betrieb?.trim() && !entry.schule?.trim()) errors.kind = "Betrieb oder Berufsschule ausfüllen";
  return errors;
}

function ReportEditor({ entry, draft, onChange, onSave, onDelete, onSubmit }) {
  if (!entry || !draft) {
    return <EmptyState title="Kein Bericht ausgewählt" description="Wähle links einen Tagesbericht oder erstelle einen neuen Eintrag." />;
  }

  const errors = validateEntry(draft);
  const locked = entry.status === "signed";

  return (
    <article className="panel-card editor-card">
      <PageHeader
        kicker="Bearbeitung"
        title={entry.weekLabel || "Neuer Tagesbericht"}
        subtitle="Pflege den Tagesbericht und reiche ihn anschließend zur Freigabe ein."
        actions={
          <div className="page-actions">
            <StatusBadge status={entry.status} />
            <PrimaryButton variant="ghost" onClick={() => onDelete(entry.id)} disabled={entry.status === "signed"}>
              Löschen
            </PrimaryButton>
          </div>
        }
      />
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
      <div className="form-grid">
        <label>
          Betrieb
          <textarea rows="8" value={draft.betrieb} onChange={(event) => onChange("betrieb", event.target.value)} disabled={locked} />
        </label>
        <label>
          Berufsschule
          <textarea rows="8" value={draft.schule} onChange={(event) => onChange("schule", event.target.value)} disabled={locked} />
        </label>
      </div>
      {errors.kind ? <div className="field-message error">{errors.kind}</div> : null}
      <div className="inline-notice">
        <strong>Hinweis:</strong> Für einen gültigen Tagesbericht reicht Betrieb oder Berufsschule. Beides zusammen ist ebenfalls möglich.
      </div>
      <div className="editor-footer">
        <PrimaryButton onClick={() => onSave(draft)} disabled={locked}>Speichern</PrimaryButton>
        <PrimaryButton variant="secondary" onClick={() => onSubmit(draft)} disabled={!!Object.keys(errors).length || locked}>
          Zur Freigabe einreichen
        </PrimaryButton>
      </div>
    </article>
  );
}

export function TagesberichtePage({ report, onCreate, onSaveEntry, onDeleteEntry, onSubmitEntry }) {
  const location = useLocation();
  const [selectedId, setSelectedId] = useState(report?.entries[0]?.id || null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(null);

  const entries = report?.entries || [];

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

  const selected = entries.find((entry) => entry.id === selectedId) || filteredEntries[0] || null;

  useEffect(() => {
    if (!selectedId && entries[0]?.id) {
      setSelectedId(entries[0].id);
    }
  }, [entries, selectedId]);

  useEffect(() => {
    const focusEntryId = location.state?.focusEntryId;
    if (focusEntryId) {
      setSelectedId(focusEntryId);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    setDraft(selected ? { ...selected } : null);
  }, [selected]);

  async function handleCreate() {
    const id = await onCreate();
    if (id) {
      setSelectedId(id);
    }
  }

  function handleChange(field, value) {
    if (!draft) return;
    setDraft({
      ...draft,
      [field]: value
    });
  }

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Tagesberichte"
        title="Berichte führen und verwalten"
        subtitle="Bearbeite Tagesberichte, filtere nach Status und reiche fertige Einträge zur Freigabe ein."
        actions={<PrimaryButton onClick={handleCreate}>Tagesbericht erstellen</PrimaryButton>}
      />
      <FilterBar>
        <input placeholder="Suche nach Titel oder Datum" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Alle Status</option>
          <option value="draft">Entwurf</option>
          <option value="submitted">Eingereicht</option>
          <option value="signed">Signiert</option>
          <option value="rejected">Abgelehnt</option>
        </select>
      </FilterBar>
      <section className="reports-layout">
        <article className="panel-card reports-list">
          {filteredEntries.length ? (
            filteredEntries.map((entry) => (
              <button key={entry.id} type="button" className={`report-list-item${selected?.id === entry.id ? " active" : ""}`} onClick={() => setSelectedId(entry.id)}>
                <div>
                  <strong>{entry.weekLabel || "Ohne Titel"}</strong>
                  <p>{entry.dateFrom || "-"}</p>
                </div>
                <StatusBadge status={entry.status} />
              </button>
            ))
          ) : (
            <EmptyState title="Keine Berichte gefunden" description="Passe die Filter an oder lege einen neuen Tagesbericht an." />
          )}
        </article>
        <ReportEditor
          entry={selected}
          draft={draft}
          onChange={handleChange}
          onSave={(entry) => onSaveEntry(entry.id, entry)}
          onDelete={onDeleteEntry}
          onSubmit={async (entry) => {
            await onSaveEntry(entry.id, entry);
            await onSubmitEntry(entry.id);
          }}
        />
      </section>
    </div>
  );
}
