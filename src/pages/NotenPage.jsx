import React, { useEffect, useMemo, useState } from "react";
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

function buildEmptyForm() {
  return {
    id: null,
    fach: "",
    typ: "Schulaufgabe",
    bezeichnung: "",
    datum: "",
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
  const errors = validateForm(form);

  async function handleSubmit() {
    if (!canManageGrades || Object.keys(errors).length) {
      return;
    }

    await onSaveGrade({
      ...form,
      traineeId: selectedTraineeId,
      note: Number(form.note),
      gewicht: getWeight(form.typ)
    });

    setForm(buildEmptyForm());
  }

  function handleEdit(grade) {
    setForm({
      id: grade.id,
      fach: grade.fach,
      typ: grade.typ,
      bezeichnung: grade.bezeichnung,
      datum: grade.datum,
      note: String(grade.note)
    });
  }

  function handleExportPdf() {
    generateGradesPdf({
      entries: normalizedGrades,
      traineeName: selectedProfile?.name || "",
      trainingTitle: selectedProfile?.ausbildung || "",
      currentDate: new Date()
    });
  }

  const pageTitle = role === "trainer" ? "Notenansicht" : "Notenverwaltung";
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
        actions={selectedProfile ? <PrimaryButton variant="secondary" onClick={handleExportPdf}>Notenübersicht als PDF</PrimaryButton> : null}
      />

      {loadError ? <div className="field-message error report-error-banner">{loadError}</div> : null}

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
            <StatCard label="Gesamtdurchschnitt" value={statistics.overallAverage ? formatGrade(statistics.overallAverage) : "-"} note="Gewichtet über alle Fächer" />
            <StatCard label="Beste Note" value={statistics.bestGrade ? formatGrade(statistics.bestGrade) : "-"} note="Niedrigster Notenwert" />
            <StatCard label="Schlechteste Note" value={statistics.worstGrade ? formatGrade(statistics.worstGrade) : "-"} note="Höchster Notenwert" />
            <StatCard label="Fächer" value={statistics.subjectCount} note={`${statistics.totalEntries} Leistungsnachweise gesamt`} />
          </section>

          <section className="reports-layout">
            <article className="panel-card">
              <PageHeader
                kicker={isReadOnly ? "Hinweis" : form.id ? "Bearbeiten" : "Neue Note"}
                title={isReadOnly ? `Noten für ${selectedProfile.name}` : form.id ? "Leistungsnachweis bearbeiten" : "Leistungsnachweis anlegen"}
              />
              {canManageGrades ? (
                <>
                  <div className="form-grid">
                    <label>
                      Fach
                      <input value={form.fach} onChange={(event) => setForm({ ...form, fach: event.target.value })} />
                      {errors.fach ? <span className="field-message error">{errors.fach}</span> : null}
                    </label>
                    <label>
                      Art
                      <select value={form.typ} onChange={(event) => setForm({ ...form, typ: event.target.value })}>
                        {GRADE_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Bezeichnung
                      <input value={form.bezeichnung} onChange={(event) => setForm({ ...form, bezeichnung: event.target.value })} />
                      {errors.bezeichnung ? <span className="field-message error">{errors.bezeichnung}</span> : null}
                    </label>
                    <label>
                      Datum
                      <input type="date" value={form.datum} onChange={(event) => setForm({ ...form, datum: event.target.value })} />
                      {errors.datum ? <span className="field-message error">{errors.datum}</span> : null}
                    </label>
                    <label>
                      Note
                      <input type="number" min="1" max="6" step="0.1" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
                      {errors.note ? <span className="field-message error">{errors.note}</span> : null}
                    </label>
                    <div className="read-only-card grade-weight-hint">
                      <span>Automatisches Gewicht</span>
                      <strong>{getWeight(form.typ)}</strong>
                      <small>{form.typ === "Schulaufgabe" ? "Schulaufgabe = 2" : "Stegreifaufgabe = 1"}</small>
                    </div>
                  </div>
                  <div className="editor-footer">
                    <PrimaryButton onClick={handleSubmit}>{form.id ? "Note aktualisieren" : "Note speichern"}</PrimaryButton>
                    {form.id ? (
                      <PrimaryButton variant="ghost" onClick={() => setForm(buildEmptyForm())}>
                        Bearbeitung abbrechen
                      </PrimaryButton>
                    ) : null}
                  </div>
                </>
              ) : (
                <EmptyState title="Read-only Ansicht" />
              )}
            </article>

            <article className="panel-card">
              <PageHeader kicker="Fächer" title="Fachschnitte" />
              {loadingGrades ? (
                <div className="empty-table">Noten werden geladen.</div>
              ) : groupedGrades.length ? (
                <div className="subject-summary-grid grade-summary-grid">
                  {groupedGrades.map((group) => (
                    <div key={group.fach} className="subject-summary-card grade-summary-card">
                      <div className="subject-summary-head">
                        <div>
                          <strong>{group.fach}</strong>
                          <p>{group.count} Leistungsnachweise</p>
                        </div>
                        {group.average ? <GradePill note={group.average} /> : null}
                      </div>
                      <div className="subject-summary-meta">
                        <span>Schulaufgaben: {group.schulaufgaben}</span>
                        <span>Stegreifaufgaben: {group.stegreifaufgaben}</span>
                        <span>Gewichtung: {group.totalWeight}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Noch keine Noten" description={noGradesMessage} />
              )}
            </article>
          </section>

          <section className="panel-card">
            <PageHeader kicker="Übersicht" title="Leistungsnachweise nach Fach" />
            <FilterBar>
              <input placeholder="Suche nach Fach, Art, Bezeichnung oder Datum" value={query} onChange={(event) => setQuery(event.target.value)} />
              <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
                <option value="all">Alle Fächer</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">Alle Arten</option>
                {GRADE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.value}
                  </option>
                ))}
              </select>
            </FilterBar>

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

                    <DataTable
                      rowKey="id"
                      rows={group.entries}
                      columns={[
                        { key: "typ", label: "Art", render: (row) => <TypeBadge type={row.typ} /> },
                        { key: "bezeichnung", label: "Bezeichnung" },
                        { key: "datum", label: "Datum", render: (row) => formatGradeDate(row.datum) },
                        { key: "note", label: "Note", render: (row) => <GradePill note={row.note} /> },
                        { key: "gewicht", label: "Gewicht", render: (row) => <span className="grade-weight-badge">{row.gewicht}</span> },
                        ...(canManageGrades
                          ? [{
                              key: "actions",
                              label: "Aktionen",
                              render: (row) => (
                                <div className="table-actions">
                                  <PrimaryButton variant="secondary" onClick={() => handleEdit(row)}>
                                    Bearbeiten
                                  </PrimaryButton>
                                  <PrimaryButton variant="ghost" onClick={() => onDeleteGrade(row.id)}>
                                    Löschen
                                  </PrimaryButton>
                                </div>
                              )
                            }]
                          : [])
                      ]}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="Keine Noten gefunden" description={selectedProfile ? "" : noTargetsMessage} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
