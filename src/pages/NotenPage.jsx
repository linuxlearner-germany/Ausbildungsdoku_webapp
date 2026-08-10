import React, { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { FilterBar } from "../components/FilterBar";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatCard } from "../components/StatCard";
import { generateGradesPdf } from "../lib/gradePdf";
import {
  GRADE_TYPES,
  calculateWeightedAverage,
  formatGrade,
  formatGradeDate,
  getGradeColor,
  getGradeStatistics,
  getWeight,
  groupGradesBySubject,
  normalizeGradeEntry
} from "../lib/grades";

function getTodayValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function buildEmptyForm() {
  return {
    id: null,
    fach: "",
    typ: "Schulaufgabe",
    bezeichnung: "",
    datum: getTodayValue(),
    note: ""
  };
}

function validateForm(form) {
  const errors = {};
  if (!form.fach.trim()) errors.fach = "Fach fehlt";
  if (!form.bezeichnung.trim()) errors.bezeichnung = "Bezeichnung fehlt";
  if (!form.datum) errors.datum = "Datum fehlt";
  if (form.note === "" || Number.isNaN(Number(form.note))) errors.note = "Note fehlt";
  else if (Number(form.note) < 1 || Number(form.note) > 6) errors.note = "Note muss zwischen 1 und 6 liegen";
  return errors;
}

function GradePill({ note }) {
  const color = getGradeColor(note);
  return <span className={`grade-pill ${color.className}`}>{formatGrade(note)}</span>;
}

function TypeBadge({ type }) {
  return <span className={`grade-type-badge grade-type-${type === "Schulaufgabe" ? "major" : "minor"}`}>{type}</span>;
}

export function NotenPage({ role, grades, report, currentUser, trainees, users, onLoadGrades, onSaveGrade, onDeleteGrade }) {
  const canManageGrades = role === "trainee" || role === "admin";
  const isReadOnly = role === "trainer";
  const editorRef = useRef(null);
  const targetOptions = useMemo(() => {
    if (role === "trainer") {
      return (trainees || []).map((trainee) => ({
        id: trainee.id,
        name: trainee.name,
        ausbildung: trainee.ausbildung,
        email: trainee.email
      }));
    }

    if (role === "admin") {
      return (users || [])
        .filter((user) => user.role === "trainee")
        .map((trainee) => ({
          id: trainee.id,
          name: trainee.name,
          ausbildung: trainee.ausbildung,
          email: trainee.email
        }));
    }

    return currentUser
      ? [{
          id: currentUser.id,
          name: report?.trainee?.name || currentUser.name,
          ausbildung: report?.trainee?.ausbildung || currentUser.ausbildung || "",
          email: currentUser.email
        }]
      : [];
  }, [role, trainees, users, currentUser, report]);

  const [selectedTraineeId, setSelectedTraineeId] = useState(() => (role === "trainee" ? currentUser?.id || null : targetOptions[0]?.id || null));
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(buildEmptyForm());
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (role === "trainee") {
      setSelectedTraineeId(currentUser?.id || null);
      return;
    }

    if (!targetOptions.length) {
      setSelectedTraineeId(null);
      return;
    }

    if (!targetOptions.some((target) => target.id === selectedTraineeId)) {
      setSelectedTraineeId(targetOptions[0].id);
    }
  }, [role, currentUser, selectedTraineeId, targetOptions]);

  useEffect(() => {
    setForm(buildEmptyForm());
    setEditorOpen(false);
    setSubmitAttempted(false);
    setDeleteTarget(null);
    setActionError("");
  }, [selectedTraineeId]);

  useEffect(() => {
    if (role === "trainee" || !selectedTraineeId) {
      return undefined;
    }

    let active = true;
    setLoadingGrades(true);
    setLoadError("");
    onLoadGrades(selectedTraineeId)
      .catch((error) => {
        if (active) {
          setLoadError(error.message || "Noten konnten nicht geladen werden.");
        }
      })
      .finally(() => {
        if (active) {
          setLoadingGrades(false);
        }
      });

    return () => {
      active = false;
    };
  }, [role, selectedTraineeId]);

  const selectedProfile = role === "trainee"
    ? {
        id: currentUser?.id || null,
        name: report?.trainee?.name || currentUser?.name || "",
        ausbildung: report?.trainee?.ausbildung || currentUser?.ausbildung || "",
        email: currentUser?.email || ""
      }
    : targetOptions.find((target) => target.id === selectedTraineeId) || null;

  const visibleGrades = role === "trainee" || selectedTraineeId ? grades : [];
  const normalizedGrades = useMemo(
    () =>
      visibleGrades
        .map(normalizeGradeEntry)
        .filter((grade) => grade.fach)
        .sort((left, right) => {
          const bySubject = left.fach.localeCompare(right.fach, "de");
          if (bySubject !== 0) {
            return bySubject;
          }

          const byDate = right.datum.localeCompare(left.datum);
          if (byDate !== 0) {
            return byDate;
          }

          return Number(right.id || 0) - Number(left.id || 0);
        }),
    [visibleGrades]
  );

  const groupedGrades = useMemo(() => groupGradesBySubject(normalizedGrades), [normalizedGrades]);
  const subjects = useMemo(() => groupedGrades.map((group) => group.fach), [groupedGrades]);
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return groupedGrades
      .map((group) => {
        if (subjectFilter !== "all" && group.fach !== subjectFilter) {
          return null;
        }

        const entries = group.entries.filter((grade) => {
          const matchesType = typeFilter === "all" ? true : grade.typ === typeFilter;
          const matchesQuery = !needle
            ? true
            : [group.fach, grade.typ, grade.bezeichnung, grade.datum, grade.note].join(" ").toLowerCase().includes(needle);
          return matchesType && matchesQuery;
        });

        if (!entries.length) {
          return null;
        }

        return {
          ...group,
          entries,
          average: calculateWeightedAverage(entries),
          count: entries.length,
          schulaufgaben: entries.filter((grade) => grade.typ === "Schulaufgabe").length,
          stegreifaufgaben: entries.filter((grade) => grade.typ === "Stegreifaufgabe").length
        };
      })
      .filter(Boolean);
  }, [groupedGrades, query, subjectFilter, typeFilter]);

  const statistics = useMemo(() => getGradeStatistics(normalizedGrades), [normalizedGrades]);
  const latestGrade = useMemo(
    () =>
      [...normalizedGrades].sort(
        (left, right) =>
          String(right.datum).localeCompare(String(left.datum)) ||
          Number(right.id || 0) - Number(left.id || 0)
      )[0] || null,
    [normalizedGrades]
  );
  const filteredEntryCount = useMemo(
    () => filteredGroups.reduce((sum, group) => sum + group.entries.length, 0),
    [filteredGroups]
  );
  const filtersActive = Boolean(query.trim() || subjectFilter !== "all" || typeFilter !== "all");
  const errors = validateForm(form);

  async function handleSubmit() {
    setSubmitAttempted(true);
    setActionError("");

    if (!canManageGrades || Object.keys(errors).length || saveBusy) {
      return;
    }

    setSaveBusy(true);
    try {
      await onSaveGrade({
        ...form,
        traineeId: selectedTraineeId,
        note: Number(form.note),
        gewicht: getWeight(form.typ)
      });
      setForm(buildEmptyForm());
      setSubmitAttempted(false);
      setEditorOpen(false);
    } catch (error) {
      setActionError(error.message || "Die Note konnte nicht gespeichert werden.");
    } finally {
      setSaveBusy(false);
    }
  }

  function handleEdit(grade) {
    setActionError("");
    setSubmitAttempted(false);
    setDeleteTarget(null);
    setForm({
      id: grade.id,
      fach: grade.fach,
      typ: grade.typ,
      bezeichnung: grade.bezeichnung,
      datum: grade.datum,
      note: String(grade.note)
    });
    setEditorOpen(true);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function openNewGradeForm() {
    setForm(buildEmptyForm());
    setActionError("");
    setSubmitAttempted(false);
    setDeleteTarget(null);
    setEditorOpen(true);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function closeEditor() {
    setForm(buildEmptyForm());
    setSubmitAttempted(false);
    setActionError("");
    setEditorOpen(false);
  }

  async function handleDelete() {
    if (!deleteTarget || deleteBusy) {
      return;
    }

    setDeleteBusy(true);
    setActionError("");
    try {
      await onDeleteGrade(deleteTarget.id);
      setDeleteTarget(null);
      if (form.id === deleteTarget.id) {
        closeEditor();
      }
    } catch (error) {
      setActionError(error.message || "Die Note konnte nicht gelöscht werden.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleExportPdf() {
    setPdfBusy(true);
    setActionError("");
    try {
      await generateGradesPdf({
        entries: normalizedGrades,
        traineeName: selectedProfile?.name || "",
        trainingTitle: selectedProfile?.ausbildung || "",
        currentDate: new Date()
      });
    } catch (error) {
      setActionError(error.message || "Die Notenübersicht konnte nicht erstellt werden.");
    } finally {
      setPdfBusy(false);
    }
  }

  function resetFilters() {
    setQuery("");
    setSubjectFilter("all");
    setTypeFilter("all");
  }

  const pageTitle = role === "trainee" ? "Meine Noten" : role === "trainer" ? "Notenansicht" : "Notenverwaltung";
  const noTargetsMessage = role === "trainer"
    ? "Dir sind aktuell keine Azubis zugeordnet. Deshalb werden keine Noten angezeigt."
    : "Es sind noch keine Azubis vorhanden.";
  const noGradesMessage = role === "trainer"
    ? "Für den ausgewählten Azubi sind aktuell keine Noten vorhanden."
    : "Lege den ersten Leistungsnachweis an, um Auswertungen pro Fach zu sehen.";

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Noten"
        title={pageTitle}
        subtitle={role === "trainee" ? "Leistungsnachweise eintragen und deine Entwicklung nach Fach verfolgen." : undefined}
        actions={selectedProfile ? (
          <>
            {canManageGrades ? (
              <PrimaryButton onClick={openNewGradeForm} disabled={saveBusy || deleteBusy}>
                Note eintragen
              </PrimaryButton>
            ) : null}
            <PrimaryButton
              variant="secondary"
              onClick={handleExportPdf}
              disabled={pdfBusy || !normalizedGrades.length}
            >
              {pdfBusy ? "PDF wird erstellt..." : "Als PDF exportieren"}
            </PrimaryButton>
          </>
        ) : null}
      />

      {loadError ? <div className="field-message error report-error-banner">{loadError}</div> : null}
      {actionError ? <div className="field-message error report-error-banner" role="alert">{actionError}</div> : null}

      {role !== "trainee" ? (
        <section className="panel-card">
          <PageHeader
            kicker="Azubi-Auswahl"
            title={role === "trainer" ? "Zugewiesene Azubis" : "Azubi auswählen"}
          />
          {targetOptions.length ? (
            <div className="form-grid">
              <label>
                Azubi
                <select value={selectedTraineeId || ""} onChange={(event) => setSelectedTraineeId(Number(event.target.value))}>
                  {targetOptions.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}{target.ausbildung ? ` · ${target.ausbildung}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="read-only-card">
                <span>Aktuelle Auswahl</span>
                <strong>{selectedProfile?.name || "-"}</strong>
                <small>{selectedProfile?.ausbildung || selectedProfile?.email || "Keine Zusatzdaten"}</small>
              </div>
              <div className="read-only-card">
                <span>Berechtigung</span>
                <strong>{isReadOnly ? "Nur lesen" : "Vollzugriff"}</strong>
              </div>
            </div>
          ) : (
            <EmptyState title="Keine Azubis verfügbar" description={noTargetsMessage} />
          )}
        </section>
      ) : null}

      {!selectedProfile ? (
        <section className="panel-card">
          <EmptyState title="Keine Auswahl" description={noTargetsMessage} />
        </section>
      ) : (
        <>
          <section className="stats-grid">
            <StatCard label="Notenschnitt" value={statistics.overallAverage ? formatGrade(statistics.overallAverage) : "-"} note="Nach Prüfungsart gewichtet" />
            <StatCard
              label="Letzte Note"
              value={latestGrade ? formatGrade(latestGrade.note) : "-"}
              note={latestGrade ? `${latestGrade.fach} · ${formatGradeDate(latestGrade.datum)}` : "Noch keine Note eingetragen"}
            />
            <StatCard label="Fächer" value={statistics.subjectCount} note="Mit mindestens einem Eintrag" />
            <StatCard label="Leistungsnachweise" value={statistics.totalEntries} note="Insgesamt erfasst" />
          </section>

          {editorOpen && canManageGrades ? (
            <article ref={editorRef} className="panel-card grade-entry-panel">
              <PageHeader
                kicker={form.id ? "Bearbeiten" : "Neue Note"}
                title={form.id ? "Leistungsnachweis bearbeiten" : "Leistungsnachweis eintragen"}
                subtitle="Schulaufgaben werden doppelt, Stegreifaufgaben einfach gewichtet."
              />
              <form onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
              }}>
                <div className="form-grid grade-entry-grid">
                  <label htmlFor="grade-subject">
                    Fach
                    <input
                      id="grade-subject"
                      list="grade-subject-options"
                      value={form.fach}
                      onChange={(event) => setForm({ ...form, fach: event.target.value })}
                      placeholder="z. B. Netzwerktechnik"
                      autoComplete="off"
                      aria-invalid={submitAttempted && Boolean(errors.fach)}
                      aria-describedby={submitAttempted && errors.fach ? "grade-subject-error" : undefined}
                    />
                    <datalist id="grade-subject-options">
                      {subjects.map((subject) => <option key={subject} value={subject} />)}
                    </datalist>
                    {submitAttempted && errors.fach ? <span id="grade-subject-error" className="field-message error">{errors.fach}</span> : null}
                  </label>
                  <label htmlFor="grade-type">
                    Prüfungsart
                    <select id="grade-type" value={form.typ} onChange={(event) => setForm({ ...form, typ: event.target.value })}>
                      {GRADE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="grade-description">
                    Bezeichnung
                    <input
                      id="grade-description"
                      value={form.bezeichnung}
                      onChange={(event) => setForm({ ...form, bezeichnung: event.target.value })}
                      placeholder="z. B. Subnetting und VLAN"
                      autoComplete="off"
                      aria-invalid={submitAttempted && Boolean(errors.bezeichnung)}
                      aria-describedby={submitAttempted && errors.bezeichnung ? "grade-description-error" : undefined}
                    />
                    {submitAttempted && errors.bezeichnung ? <span id="grade-description-error" className="field-message error">{errors.bezeichnung}</span> : null}
                  </label>
                  <label htmlFor="grade-date">
                    Datum
                    <input
                      id="grade-date"
                      type="date"
                      value={form.datum}
                      onChange={(event) => setForm({ ...form, datum: event.target.value })}
                      aria-invalid={submitAttempted && Boolean(errors.datum)}
                      aria-describedby={submitAttempted && errors.datum ? "grade-date-error" : undefined}
                    />
                    {submitAttempted && errors.datum ? <span id="grade-date-error" className="field-message error">{errors.datum}</span> : null}
                  </label>
                  <label htmlFor="grade-value">
                    Note
                    <input
                      id="grade-value"
                      type="number"
                      min="1"
                      max="6"
                      step="0.1"
                      inputMode="decimal"
                      value={form.note}
                      onChange={(event) => setForm({ ...form, note: event.target.value })}
                      placeholder="1,0 bis 6,0"
                      aria-invalid={submitAttempted && Boolean(errors.note)}
                      aria-describedby={submitAttempted && errors.note ? "grade-value-error" : "grade-weight-help"}
                    />
                    {submitAttempted && errors.note ? <span id="grade-value-error" className="field-message error">{errors.note}</span> : null}
                  </label>
                  <div className="read-only-card grade-weight-hint" id="grade-weight-help">
                    <span>Gewichtung</span>
                    <strong>{getWeight(form.typ)}×</strong>
                    <small>{form.typ === "Schulaufgabe" ? "Zählt doppelt im Durchschnitt" : "Zählt einfach im Durchschnitt"}</small>
                  </div>
                </div>
                <div className="editor-footer">
                  <PrimaryButton type="submit" disabled={saveBusy}>
                    {saveBusy ? "Wird gespeichert..." : form.id ? "Änderungen speichern" : "Note speichern"}
                  </PrimaryButton>
                  <PrimaryButton type="button" variant="ghost" onClick={closeEditor} disabled={saveBusy}>
                    Abbrechen
                  </PrimaryButton>
                </div>
              </form>
            </article>
          ) : null}

          <section className="panel-card">
            <PageHeader
              kicker="Fächer"
              title="Deine Fachschnitte"
              subtitle="Wähle ein Fach aus, um die Liste darunter zu filtern."
            />
            {loadingGrades ? (
              <div className="empty-table">Noten werden geladen.</div>
            ) : groupedGrades.length ? (
              <div className="subject-summary-grid grade-summary-grid">
                {groupedGrades.map((group) => (
                  <button
                    type="button"
                    key={group.fach}
                    className={`subject-summary-card grade-summary-card grade-summary-card-button${subjectFilter === group.fach ? " active" : ""}`}
                    onClick={() => setSubjectFilter((current) => current === group.fach ? "all" : group.fach)}
                    aria-pressed={subjectFilter === group.fach}
                  >
                    <div className="subject-summary-head">
                      <div>
                        <strong>{group.fach}</strong>
                        <p>{group.count} Leistungsnachweise</p>
                      </div>
                      {group.average ? <GradePill note={group.average} /> : null}
                    </div>
                    <div className="subject-summary-meta">
                      <span>{group.schulaufgaben} Schulaufgaben</span>
                      <span>{group.stegreifaufgaben} Stegreifaufgaben</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="Noch keine Noten" description={noGradesMessage} />
            )}
          </section>

          <section className="panel-card">
            <PageHeader
              kicker="Übersicht"
              title="Alle Leistungsnachweise"
              subtitle={filtersActive ? `${filteredEntryCount} von ${statistics.totalEntries} Einträgen werden angezeigt.` : "Nach Fach gruppiert, neueste Einträge zuerst."}
              actions={filtersActive ? (
                <PrimaryButton variant="ghost" onClick={resetFilters}>Filter zurücksetzen</PrimaryButton>
              ) : null}
            />
            <div className="grade-filter-wrap">
              <FilterBar>
                <input
                  type="search"
                  aria-label="Leistungsnachweise durchsuchen"
                  placeholder="Fach oder Bezeichnung suchen"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <select aria-label="Nach Fach filtern" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
                  <option value="all">Alle Fächer</option>
                  {subjects.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
                <select aria-label="Nach Prüfungsart filtern" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">Alle Arten</option>
                  {GRADE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.value}
                    </option>
                  ))}
                </select>
              </FilterBar>
            </div>

            {deleteTarget ? (
              <div className="grade-delete-confirmation" role="alertdialog" aria-labelledby="grade-delete-title">
                <div>
                  <strong id="grade-delete-title">Leistungsnachweis wirklich löschen?</strong>
                  <p>
                    {deleteTarget.fach} · {deleteTarget.bezeichnung} · Note {formatGrade(deleteTarget.note)}
                  </p>
                </div>
                <div className="grade-delete-actions">
                  <PrimaryButton variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
                    Abbrechen
                  </PrimaryButton>
                  <PrimaryButton variant="danger" onClick={handleDelete} disabled={deleteBusy}>
                    {deleteBusy ? "Wird gelöscht..." : "Endgültig löschen"}
                  </PrimaryButton>
                </div>
              </div>
            ) : null}

            {loadingGrades ? (
              <div className="empty-table">Noten werden geladen.</div>
            ) : filteredGroups.length ? (
              <div className="grade-group-list">
                {filteredGroups.map((group) => (
                  <article key={group.fach} className="grade-section-card">
                    <div className="grade-section-head">
                      <div>
                        <h3>{group.fach}</h3>
                        <p>{group.count} Einträge, neueste zuerst</p>
                      </div>
                      <div className="grade-section-metrics">
                        <div className="grade-stat-detail">
                          <span>Fachschnitt</span>
                          <strong>{group.average ? formatGrade(group.average) : "-"}</strong>
                        </div>
                        <div className="grade-stat-detail">
                          <span>Gewichtung</span>
                          <strong>{group.entries.reduce((sum, entry) => sum + entry.gewicht, 0)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="grade-desktop-table">
                      <DataTable
                        rowKey="id"
                        rows={group.entries}
                        columns={[
                          { key: "typ", label: "Art", render: (row) => <TypeBadge type={row.typ} /> },
                          { key: "bezeichnung", label: "Bezeichnung" },
                          { key: "datum", label: "Datum", render: (row) => formatGradeDate(row.datum) },
                          { key: "note", label: "Note", render: (row) => <GradePill note={row.note} /> },
                          { key: "gewicht", label: "Gewicht", render: (row) => <span className="grade-weight-badge">{row.gewicht}×</span> },
                          ...(canManageGrades
                            ? [{
                                key: "actions",
                                label: "Aktionen",
                                render: (row) => (
                                  <div className="table-actions">
                                    <PrimaryButton variant="secondary" onClick={() => handleEdit(row)} disabled={saveBusy || deleteBusy}>
                                      Bearbeiten
                                    </PrimaryButton>
                                    <PrimaryButton variant="ghost" onClick={() => setDeleteTarget(row)} disabled={saveBusy || deleteBusy}>
                                      Löschen
                                    </PrimaryButton>
                                  </div>
                                )
                              }]
                            : [])
                        ]}
                      />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title={statistics.totalEntries ? "Keine passenden Noten gefunden" : "Noch keine Noten"}
                description={statistics.totalEntries ? "Passe die Suche oder die Filter an." : noGradesMessage}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
