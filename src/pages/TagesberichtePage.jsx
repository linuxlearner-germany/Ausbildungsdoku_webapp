import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { PrimaryButton } from "../components/PrimaryButton";
import { FilterBar } from "../components/FilterBar";
import { EmptyState } from "../components/EmptyState";
import { CalendarGrid } from "../components/CalendarGrid";
import { buildLocalWeekDates, createLocalDate, formatLocalDate, getTodayLocalDateString, parseLocalDate, startOfLocalMonth, toLocalDateString } from "../lib/date.mjs";

const VIEW_OPTIONS = [
  { id: "calendar", label: "Kalender" },
  { id: "list", label: "Liste" },
  { id: "write", label: "Schreiben" }
];

function buildEmptyEntry(date = "") {
  const label = date
    ? formatLocalDate(date, {
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
  return formatLocalDate(date, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function dayTone(entry) {
  if (!entry) return { label: "Noch kein Bericht", description: "Fuer diesen Tag wurde noch kein Eintrag angelegt." };
  if (entry.status === "submitted") return { label: "Eingereicht", description: "Dieser Bericht wartet auf Freigabe." };
  if (entry.status === "signed") return { label: "Signiert", description: "Der Bericht ist abgeschlossen und signiert." };
  if (entry.status === "rejected") return { label: "Nachbearbeitung", description: "Rueckmeldung liegt vor. Bitte den Bericht anpassen." };
  return { label: "Entwurf", description: "Der Bericht ist angelegt und kann weiterbearbeitet werden." };
}

function getEntryPermissions(entry) {
  if (!entry?.id) {
    return {
      editable: true,
      deletable: false,
      submittable: true,
      readOnly: false,
      notice: ""
    };
  }

  if (entry.status === "draft") {
    return {
      editable: true,
      deletable: true,
      submittable: true,
      readOnly: false,
      notice: ""
    };
  }

  if (entry.status === "rejected") {
    return {
      editable: true,
      deletable: false,
      submittable: true,
      readOnly: false,
      notice: "Der Bericht wurde zur Nachbearbeitung zurueckgegeben und kann erneut bearbeitet werden."
    };
  }

  if (entry.status === "submitted") {
    return {
      editable: false,
      deletable: false,
      submittable: false,
      readOnly: true,
      notice: "Dieser Bericht ist eingereicht und bleibt schreibgeschuetzt, bis er freigegeben oder zur Nachbearbeitung zurueckgegeben wird."
    };
  }

  if (entry.status === "signed") {
    return {
      editable: false,
      deletable: false,
      submittable: false,
      readOnly: true,
      notice: "Dieser Bericht ist signiert und kann nicht mehr bearbeitet werden."
    };
  }

  return {
    editable: true,
    deletable: false,
    submittable: false,
    readOnly: false,
    notice: ""
  };
}

function buildWeekDates(date) {
  return buildLocalWeekDates(date || getTodayLocalDateString());
}

function ReportEditor({
  entry,
  draft,
  selectedDate,
  inline = false,
  busy = false,
  onChange,
  onSave,
  onDelete,
  onSubmit,
  onCreateForDate,
  onClose
}) {
  if (!draft) {
    return (
      <article className={`panel-card editor-card${inline ? " editor-card-inline" : ""}`}>
        <EmptyState title="Kein Bericht ausgewaehlt" description="Waehle einen Tag oder oeffne einen bestehenden Bericht." />
      </article>
    );
  }

  const errors = validateEntry(draft);
  const permissions = getEntryPermissions(entry);
  const locked = !permissions.editable;
  const isExistingEntry = Boolean(entry?.id);
  const tone = dayTone(entry);

  return (
    <article className={`panel-card editor-card${inline ? " editor-card-inline" : ""}`}>
      <PageHeader
        kicker={isExistingEntry ? "Bericht bearbeiten" : "Neuer Bericht"}
        title={isExistingEntry ? entry.weekLabel || "Tagesbericht" : `Bericht fuer ${formatLongDate(selectedDate || draft.dateFrom)}`}
        subtitle="Kompakter Schreibmodus mit klarer Tageszuordnung, Status und Freigabeweg."
        actions={
          <div className="page-actions">
            <StatusBadge status={entry?.status || "draft"} />
            {onClose ? (
              <PrimaryButton variant="secondary" onClick={onClose} disabled={busy}>
                Schliessen
              </PrimaryButton>
            ) : null}
            {isExistingEntry && permissions.deletable ? (
              <PrimaryButton variant="ghost" onClick={() => onDelete(entry.id)} disabled={busy}>
                Loeschen
              </PrimaryButton>
            ) : !isExistingEntry ? (
              <PrimaryButton variant="secondary" onClick={() => onCreateForDate(draft.dateFrom || selectedDate || "")} disabled={busy}>
                Entwurf anlegen
              </PrimaryButton>
            ) : null}
          </div>
        }
      />

      <div className="report-editor-summary">
        <div className="report-meta-card">
          <span>Tag</span>
          <strong>{formatLongDate(selectedDate || draft.dateFrom)}</strong>
        </div>
        <div className="report-meta-card">
          <span>Status</span>
          <strong>{tone.label}</strong>
          <small>{tone.description}</small>
        </div>
      </div>

      {permissions.notice ? (
        <div className="inline-notice">
          <strong>Hinweis:</strong> {permissions.notice}
        </div>
      ) : null}

      <div className="form-grid">
        {permissions.readOnly ? (
          <>
            <div className="read-only-card">
              <span>Titel</span>
              <strong>{draft.weekLabel || "-"}</strong>
            </div>
            <div className="read-only-card">
              <span>Tag</span>
              <strong>{formatLongDate(draft.dateFrom)}</strong>
            </div>
          </>
        ) : (
          <>
            <label>
              Titel
              <input value={draft.weekLabel} onChange={(event) => onChange("weekLabel", event.target.value)} disabled={locked || busy} />
              {errors.weekLabel ? <span className="field-message error">{errors.weekLabel}</span> : null}
            </label>
            <label>
              Tag
              <input type="date" value={draft.dateFrom} onChange={(event) => onChange("dateFrom", event.target.value)} disabled={locked || busy} />
              {errors.dateFrom ? <span className="field-message error">{errors.dateFrom}</span> : null}
            </label>
          </>
        )}
      </div>

      <div className="report-type-pills">
        <span className={`report-type-pill${draft.betrieb?.trim() ? " active" : ""}`}>Betrieb</span>
        <span className={`report-type-pill${draft.schule?.trim() ? " active" : ""}`}>Berufsschule</span>
      </div>

      <div className="editor-writing-grid">
        {permissions.readOnly ? (
          <>
            <div className="read-only-card read-only-copy">
              <span>Was wurde im Betrieb gemacht?</span>
              <strong>{draft.betrieb || "-"}</strong>
            </div>
            <div className="read-only-card read-only-copy">
              <span>Was war in der Berufsschule wichtig?</span>
              <strong>{draft.schule || "-"}</strong>
            </div>
          </>
        ) : (
          <>
            <label>
              Was wurde im Betrieb gemacht?
              <textarea rows="12" value={draft.betrieb} onChange={(event) => onChange("betrieb", event.target.value)} disabled={locked || busy} />
            </label>
            <label>
              Was war in der Berufsschule wichtig?
              <textarea rows="12" value={draft.schule} onChange={(event) => onChange("schule", event.target.value)} disabled={locked || busy} />
            </label>
          </>
        )}
      </div>

      {!permissions.readOnly && errors.kind ? <div className="field-message error">{errors.kind}</div> : null}

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

      {!permissions.readOnly ? (
        <div className="editor-footer">
          <PrimaryButton onClick={() => onSave(draft)} disabled={locked || busy}>
            {busy ? "Speichert..." : "Speichern"}
          </PrimaryButton>
          <PrimaryButton variant="secondary" onClick={() => onSubmit(draft)} disabled={locked || busy || !permissions.submittable || !!Object.keys(errors).length}>
            {busy ? "Wird eingereicht..." : "Zur Freigabe einreichen"}
          </PrimaryButton>
        </div>
      ) : null}
    </article>
  );
}

export function TagesberichtePage({ report, initialView = "calendar", onCreate, onSaveEntry, onDeleteEntry, onSubmitEntry }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const entries = report?.entries || [];
  const today = getTodayLocalDateString();
  const defaultDate = entries[0]?.dateFrom || today;
  const initialSelectedId = initialView === "calendar" ? null : entries.find((entry) => entry.dateFrom === defaultDate)?.id || entries[0]?.id || null;
  const [selectedDate, setSelectedDate] = useState(initialView === "calendar" ? today : defaultDate);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [activeView, setActiveView] = useState(() => {
    const requested = searchParams.get("view");
    return VIEW_OPTIONS.some((view) => view.id === requested) ? requested : initialView === "editor" ? "write" : initialView;
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const seed = parseLocalDate(defaultDate) || parseLocalDate(today);
    return startOfLocalMonth(seed);
  });
  const [drawerOpen, setDrawerOpen] = useState(initialView === "editor");
  const [draft, setDraft] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const previousSelectedDateRef = useRef(selectedDate);

  const entryByDate = useMemo(() => new Map(entries.map((entry) => [entry.dateFrom, entry])), [entries]);
  const selectedEntry = useMemo(() => {
    if (selectedDate) {
      const datedEntry = entryByDate.get(selectedDate) || null;
      if (datedEntry) {
        return datedEntry;
      }
    }
    if (selectedId) {
      return entries.find((entry) => entry.id === selectedId) || null;
    }
    return null;
  }, [entries, entryByDate, selectedDate, selectedId]);
  const editorKey = `${selectedEntry?.id || "new"}:${selectedDate || "none"}`;
  const selectedPermissions = useMemo(() => getEntryPermissions(selectedEntry), [selectedEntry]);

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const matchesStatus = statusFilter === "all" ? true : entry.status === statusFilter;
        const needle = query.trim().toLowerCase();
        const matchesQuery = !needle ? true : [entry.weekLabel, entry.dateFrom, entry.betrieb, entry.schule].join(" ").toLowerCase().includes(needle);
        return matchesStatus && matchesQuery;
      }),
    [entries, query, statusFilter]
  );

  const weekDates = useMemo(() => buildWeekDates(selectedDate || today), [selectedDate, today]);

  useEffect(() => {
    if (selectedEntry) {
      setDraft({ ...selectedEntry });
      return;
    }

    setDraft(selectedDate ? buildEmptyEntry(selectedDate) : null);
  }, [selectedDate, selectedEntry]);

  useEffect(() => {
    if (!selectedDate && entries[0]?.dateFrom) {
      setSelectedDate(entries[0].dateFrom);
    }
  }, [entries, selectedDate]);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    const datedEntry = entryByDate.get(selectedDate) || null;
    const nextSelectedId = datedEntry?.id || null;
    if (selectedId !== nextSelectedId) {
      setSelectedId(nextSelectedId);
    }
  }, [entryByDate, selectedDate, selectedId]);

  useEffect(() => {
    if (!selectedDate) return;
    if (previousSelectedDateRef.current === selectedDate) {
      return;
    }

    previousSelectedDateRef.current = selectedDate;
    const date = parseLocalDate(selectedDate);
    if (date) {
      setVisibleMonth(startOfLocalMonth(date));
    }
  }, [selectedDate]);

  async function ensureEntry(date) {
    setActionError("");
    const targetDate = date || selectedDate || today;
    const existing = entryByDate.get(targetDate);
    if (existing) {
      setSelectedId(existing.id);
      setSelectedDate(targetDate);
      return existing.id;
    }

    const id = await onCreate(targetDate);
    if (id) {
      setSelectedId(id);
      setSelectedDate(targetDate);
    }
    return id;
  }

  function openEditorForDate(date) {
    const targetDate = date || today;
    const existing = entryByDate.get(targetDate) || null;
    setActionError("");
    setSelectedDate(targetDate);
    setSelectedId(existing?.id || null);
    setDraft(existing ? { ...existing } : buildEmptyEntry(targetDate));
    setDrawerOpen(true);
  }

  function handleSelectDate(date) {
    const targetDate = date || today;
    setActionError("");
    setSelectedDate(targetDate);
    const existing = entryByDate.get(targetDate) || null;
    setSelectedId(existing?.id || null);
    setDraft(existing ? { ...existing } : buildEmptyEntry(targetDate));
  }

  function openEditorForEntry(entryId) {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    setSelectedDate(entry.dateFrom);
    setSelectedId(entry.id);
    setDrawerOpen(true);
  }

  async function persistDraft(nextDraft) {
    if (!nextDraft) return null;
    const sourceEntry = nextDraft.id ? entries.find((entry) => entry.id === nextDraft.id) || null : selectedEntry;
    const sourcePermissions = getEntryPermissions(sourceEntry);
    if (!sourcePermissions.editable) {
      throw new Error(sourcePermissions.notice || "Dieser Bericht ist schreibgeschuetzt.");
    }
    if (sourceEntry?.id) {
      await onSaveEntry(sourceEntry.id, nextDraft);
      setSelectedId(sourceEntry.id);
      setSelectedDate(nextDraft.dateFrom || selectedDate);
      return sourceEntry.id;
    }

    const id = await onCreate(nextDraft.dateFrom || selectedDate);
    if (!id) {
      return null;
    }

    await onSaveEntry(id, { ...nextDraft, id, status: "draft", signedAt: null, signerName: "", trainerComment: "", rejectionReason: "" });
    setSelectedId(id);
    setSelectedDate(nextDraft.dateFrom || selectedDate);
    return id;
  }

  async function handleSave(nextDraft) {
    setActionBusy(true);
    setActionError("");

    try {
      return await persistDraft(nextDraft);
    } catch (error) {
      setActionError(error.message || "Bericht konnte nicht gespeichert werden.");
      return null;
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSubmit(nextDraft) {
    try {
      setActionBusy(true);
      setActionError("");
      const entryId = (await persistDraft(nextDraft)) || selectedEntry?.id;
      if (entryId) {
        await onSubmitEntry(entryId);
        setSelectedId(entryId);
      }
    } catch (error) {
      setActionError(error.message || "Bericht konnte nicht eingereicht werden.");
    } finally {
      setActionBusy(false);
    }
  }

  function handleChangeMonth(offset) {
    setVisibleMonth((current) => {
      const nextMonth = startOfLocalMonth(createLocalDate(current.getFullYear(), current.getMonth() + offset, 1));
      const currentSelection = parseLocalDate(selectedDate || today) || parseLocalDate(today);
      const targetDay = Math.min(
        currentSelection.getDate(),
        new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
      );
      const nextSelection = toLocalDateString(createLocalDate(nextMonth.getFullYear(), nextMonth.getMonth(), targetDay));
      setSelectedDate(nextSelection);
      setSelectedId(entryByDate.get(nextSelection)?.id || null);
      return nextMonth;
    });
  }

  function handleChange(field, value) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if (field === "dateFrom") {
        next.dateTo = value;
        setSelectedDate(value);
        setSelectedId(entryByDate.get(value)?.id || null);
      }
      return next;
    });
  }

  async function handleDelete(entryId) {
    setActionBusy(true);
    setActionError("");
    try {
      await onDeleteEntry(entryId);
      setSelectedId(null);
      setDrawerOpen(false);
    } catch (error) {
      setActionError(error.message || "Bericht konnte nicht geloescht werden.");
    } finally {
      setActionBusy(false);
    }
  }

  const selectedDayEntry = selectedDate ? entryByDate.get(selectedDate) || null : null;
  const selectedDayTone = dayTone(selectedDayEntry);
  useEffect(() => {
    const requested = searchParams.get("view");
    if (VIEW_OPTIONS.some((view) => view.id === requested) && requested !== activeView) {
      setActiveView(requested);
    }
  }, [activeView, searchParams]);

  function switchView(nextView) {
    setActiveView(nextView);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", nextView);
    setSearchParams(nextParams, { replace: true });
    if (nextView === "write") {
      setDrawerOpen(false);
    }
  }

  return (
    <div className="page-stack report-module">
      <PageHeader
        kicker="Berichte"
        title="Berichte"
        subtitle="Ein Arbeitsmodul mit drei klaren Modi: Kalender fuer Planung, Liste fuer Uebersicht und Schreiben fuer fokussiertes Erfassen."
        actions={
          <div className="page-actions">
            <div className="view-switch">
              {VIEW_OPTIONS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={`view-switch-button${activeView === view.id ? " active" : ""}`}
                  onClick={() => switchView(view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <PrimaryButton variant="secondary" onClick={() => handleSelectDate(today)}>
              Heute
            </PrimaryButton>
            <PrimaryButton
              onClick={async () => {
                const date = selectedDate || today;
                if (activeView === "write") {
                  await ensureEntry(date);
                } else {
                  openEditorForDate(date);
                }
              }}
            >
              Bericht oeffnen
            </PrimaryButton>
          </div>
        }
      />

      {actionError ? <div className="field-message error report-error-banner">{actionError}</div> : null}

      {activeView === "calendar" ? (
        <section className="report-module-calendar">
          <CalendarGrid
            entries={entries}
            month={visibleMonth}
            selectedDate={selectedDate}
            onChangeMonth={handleChangeMonth}
            onSelectDate={handleSelectDate}
            variant="large"
          />

          <section className="panel-card week-strip-card">
            <PageHeader
              kicker="Woche"
              title={`Arbeitswoche ab ${formatLongDate(weekDates[0])}`}
              subtitle="Springe schnell zwischen Tagen, ohne die Monatsansicht zu verlassen."
            />
            <div className="week-strip">
              {weekDates.map((date) => {
                const entry = entryByDate.get(date);
                return (
                  <button
                    key={date}
                    type="button"
                    className={`week-strip-day${selectedDate === date ? " active" : ""}`}
                    onClick={() => handleSelectDate(date)}
                  >
                    <small>{formatLocalDate(date, { weekday: "short" })}</small>
                    <strong>{formatLocalDate(date, { day: "2-digit", month: "2-digit" })}</strong>
                    <span>{entry ? <StatusBadge status={entry.status} /> : "Leer"}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel-card day-inspector-card">
            <div className="day-inspector-head">
              <div>
                <p className="page-kicker">Tag</p>
                <h3>{formatLongDate(selectedDate)}</h3>
                <p>{selectedDayTone.description}</p>
              </div>
              <StatusBadge status={selectedDayEntry?.status || "missing"} />
            </div>
            <div className="day-inspector-actions">
              {selectedDayEntry ? (
                <>
                  <div className="day-inspector-copy">
                    <strong>{selectedDayEntry.weekLabel || "Ohne Titel"}</strong>
                    <small>{selectedDayEntry.betrieb && selectedDayEntry.schule ? "Betrieb und Berufsschule dokumentiert" : selectedDayEntry.betrieb ? "Betrieb dokumentiert" : selectedDayEntry.schule ? "Berufsschule dokumentiert" : "Noch ohne Inhalt"}</small>
                  </div>
                  <div className="day-inspector-button-row">
                    <PrimaryButton variant="secondary" onClick={() => switchView("write")}>Zur Schreibansicht</PrimaryButton>
                    <PrimaryButton onClick={() => openEditorForEntry(selectedDayEntry.id)}>Im Seitenpanel bearbeiten</PrimaryButton>
                  </div>
                </>
              ) : (
                <>
                  <div className="day-inspector-copy">
                    <strong>Kein Bericht vorhanden</strong>
                    <small>Lege direkt fuer den ausgewaehlten Tag einen neuen Entwurf an.</small>
                  </div>
                  <div className="day-inspector-button-row">
                    <PrimaryButton variant="secondary" onClick={() => switchView("write")}>Zur Schreibansicht</PrimaryButton>
                    <PrimaryButton onClick={() => openEditorForDate(selectedDate)}>Neuen Bericht schreiben</PrimaryButton>
                  </div>
                </>
              )}
            </div>
          </section>

          {drawerOpen ? (
            <div className="report-editor-drawer">
              <div className="report-editor-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
              <div className="report-editor-panel">
                <ReportEditor
                  key={editorKey}
                  entry={selectedEntry}
                  draft={draft}
                  selectedDate={selectedDate}
                  onChange={handleChange}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onSubmit={handleSubmit}
                  onCreateForDate={ensureEntry}
                  onClose={() => setDrawerOpen(false)}
                  busy={actionBusy}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeView === "list" ? (
        <section className="panel-card report-listing-panel">
          <PageHeader
            kicker="Listenansicht"
            title="Vorhandene Berichte schnell finden"
            subtitle="Kompakte Uebersicht fuer Suche, Statusfilter und direkten Sprung in die Bearbeitung."
          />
          <FilterBar>
            <input placeholder="Nach Titel, Datum oder Inhalt suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Alle Status</option>
              <option value="draft">Entwurf</option>
              <option value="submitted">Eingereicht</option>
              <option value="signed">Signiert</option>
              <option value="rejected">Nachbearbeitung</option>
            </select>
          </FilterBar>
          {filteredEntries.length ? (
            <div className="report-listing-rows">
              {filteredEntries.map((entry) => (
                <button key={entry.id} type="button" className="report-list-row" onClick={() => openEditorForEntry(entry.id)}>
                  <div className="report-list-summary">
                    <strong>{entry.weekLabel || "Ohne Titel"}</strong>
                    <StatusBadge status={entry.status} />
                  </div>
                  <div className="report-list-meta">
                    <span>{entry.dateFrom || "-"}</span>
                    <span>{entry.betrieb && entry.schule ? "Betrieb + Schule" : entry.betrieb ? "Betrieb" : entry.schule ? "Berufsschule" : "Noch ohne Inhalt"}</span>
                  </div>
                  <p>{entry.trainerComment || "Direkt oeffnen, aktualisieren oder erneut einreichen."}</p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="Keine Berichte gefunden" description="Passe die Filter an oder starte einen neuen Bericht fuer einen Tag." />
          )}
        </section>
      ) : null}

      {activeView === "write" ? (
        <section className="report-writing-view">
          <div className="panel-card writing-toolbar">
            <PageHeader
              kicker="Schreibansicht"
              title="Fokussiert schreiben"
              subtitle="Der Editor ist hier die Hauptflaeche. Tageswahl und Aktionen bleiben kompakt darueber."
            />
            <div className="writing-toolbar-controls">
              <label>
                Arbeitstag
                <input type="date" value={selectedDate} onChange={(event) => handleSelectDate(event.target.value)} />
              </label>
              <div className="writing-toolbar-status">
                <span>Status</span>
                <StatusBadge status={selectedEntry?.status || "missing"} />
              </div>
              <PrimaryButton
                variant="secondary"
                onClick={() => ensureEntry(selectedDate)}
                disabled={selectedEntry?.status === "submitted" || selectedEntry?.status === "signed"}
              >
                {selectedEntry ? "Bericht laden" : "Entwurf laden"}
              </PrimaryButton>
            </div>
          </div>
          <ReportEditor
            key={editorKey}
            entry={selectedEntry}
            draft={draft}
            selectedDate={selectedDate}
            inline
            onChange={handleChange}
            onSave={handleSave}
            onDelete={handleDelete}
            onSubmit={handleSubmit}
            onCreateForDate={ensureEntry}
            busy={actionBusy}
          />
        </section>
      ) : null}
    </div>
  );
}
