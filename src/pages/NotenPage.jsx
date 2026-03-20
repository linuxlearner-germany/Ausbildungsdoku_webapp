import React, { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { FilterBar } from "../components/FilterBar";
import { DataTable } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatCard } from "../components/StatCard";
import { GRADE_TYPES, calculateWeightedAverage, formatGrade, gradeTone, gradeWeight, summarizeGrades } from "../lib/grades";

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
  return <span className={`grade-pill grade-${gradeTone(Number(note))}`}>{formatGrade(note)}</span>;
}

export function NotenPage({ grades, onSaveGrade, onDeleteGrade }) {
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(buildEmptyForm());

  const subjects = useMemo(
    () => Array.from(new Set(grades.map((grade) => grade.fach))).sort((a, b) => a.localeCompare(b, "de")),
    [grades]
  );

  const filteredGrades = useMemo(() => {
    return grades.filter((grade) => {
      const matchesSubject = subjectFilter === "all" ? true : grade.fach === subjectFilter;
      const matchesType = typeFilter === "all" ? true : grade.typ === typeFilter;
      const needle = query.trim().toLowerCase();
      const matchesQuery = !needle
        ? true
        : [grade.fach, grade.typ, grade.bezeichnung, grade.datum].join(" ").toLowerCase().includes(needle);
      return matchesSubject && matchesType && matchesQuery;
    });
  }, [grades, query, subjectFilter, typeFilter]);

  const summary = useMemo(() => summarizeGrades(grades), [grades]);
  const overallAverage = useMemo(() => calculateWeightedAverage(grades), [grades]);
  const errors = validateForm(form);

  async function handleSubmit() {
    if (Object.keys(errors).length) return;
    await onSaveGrade({
      ...form,
      note: Number(form.note),
      gewicht: gradeWeight(form.typ)
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

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Noten"
        title="Notenverwaltung"
        subtitle="Leistungsnachweise pflegen, nach Fach auswerten und gewichtete Durchschnitte automatisch berechnen."
        actions={
          <a className="button button-secondary" href="/api/grades/pdf">
            Noten als PDF
          </a>
        }
      />

      <section className="stats-grid">
        <StatCard label="Gesamtdurchschnitt" value={overallAverage ? formatGrade(overallAverage) : "-"} note="Gewichtet über alle Fächer" />
        <StatCard label="Fächer" value={summary.length} note="Mit mindestens einer Note" />
        <StatCard label="Schulaufgaben" value={grades.filter((grade) => grade.typ === "Schulaufgabe").length} note="Gewichtung 2" />
        <StatCard label="Stegreifaufgaben" value={grades.filter((grade) => grade.typ === "Stegreifaufgabe").length} note="Gewichtung 1" />
      </section>

      <section className="reports-layout">
        <article className="panel-card">
          <PageHeader
            kicker={form.id ? "Bearbeiten" : "Neue Note"}
            title={form.id ? "Leistungsnachweis bearbeiten" : "Leistungsnachweis anlegen"}
            subtitle="Gewichtung wird anhand der Art automatisch gesetzt."
          />
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
            <label>
              Gewicht
              <input value={gradeWeight(form.typ)} disabled />
            </label>
          </div>
          <div className="editor-footer">
            <PrimaryButton onClick={handleSubmit}>{form.id ? "Note aktualisieren" : "Note speichern"}</PrimaryButton>
            {form.id ? (
              <PrimaryButton variant="ghost" onClick={() => setForm(buildEmptyForm())}>
                Bearbeitung abbrechen
              </PrimaryButton>
            ) : null}
          </div>
        </article>

        <article className="panel-card">
          <PageHeader kicker="Fächer" title="Durchschnitt pro Fach" subtitle="Schulaufgaben zählen doppelt, Stegreifaufgaben einfach." />
          {summary.length ? (
            <div className="subject-summary-grid">
              {summary.map((item) => (
                <div key={item.fach} className="subject-summary-card">
                  <div className="subject-summary-head">
                    <strong>{item.fach}</strong>
                    <GradePill note={item.average} />
                  </div>
                  <p>{item.count} Leistungsnachweise</p>
                  <div className="subject-summary-meta">
                    <span>Schulaufgaben: {item.schulaufgaben}</span>
                    <span>Stegreifaufgaben: {item.stegreifaufgaben}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Noch keine Noten" description="Lege den ersten Leistungsnachweis an, um Auswertungen pro Fach zu sehen." />
          )}
        </article>
      </section>

      <section className="panel-card">
        <PageHeader kicker="Übersicht" title="Leistungsnachweise" subtitle="Filtere nach Fach und Art oder bearbeite bestehende Noten." />
        <FilterBar>
          <input placeholder="Suche nach Fach, Art oder Bezeichnung" value={query} onChange={(event) => setQuery(event.target.value)} />
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
        {filteredGrades.length ? (
          <DataTable
            rowKey="id"
            rows={filteredGrades}
            columns={[
              { key: "fach", label: "Fach" },
              { key: "typ", label: "Art" },
              { key: "bezeichnung", label: "Bezeichnung" },
              { key: "datum", label: "Datum" },
              { key: "note", label: "Note", render: (row) => <GradePill note={row.note} /> },
              { key: "gewicht", label: "Gewicht" },
              {
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
              }
            ]}
          />
        ) : (
          <EmptyState title="Keine Noten gefunden" description="Passe die Filter an oder lege einen neuen Leistungsnachweis an." />
        )}
      </section>
    </div>
  );
}
