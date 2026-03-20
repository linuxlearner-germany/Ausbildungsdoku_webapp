import React, { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { CalendarGrid } from "../components/CalendarGrid";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";

function validateEntry(entry) {
  return !!entry && !!entry.weekLabel && !!entry.dateFrom && (!!entry.betrieb || !!entry.schule);
}

function buildRows(entries, month) {
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return Array.from({ length: lastDay.getDate() }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
    const iso = date.toISOString().slice(0, 10);
    const entry = entries.find((item) => item.dateFrom === iso);
    let status = "missing";
    if (entry && !validateEntry(entry)) status = "invalid";
    if (entry && validateEntry(entry)) status = entry.status;
    return {
      id: iso,
      day: date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }),
      status,
      title: entry?.weekLabel || "-",
      type: entry?.betrieb && entry?.schule ? "Betrieb + Schule" : entry?.betrieb ? "Betrieb" : entry?.schule ? "Berufsschule" : "-",
      note:
        status === "missing"
          ? "Kein Tagesbericht vorhanden"
          : status === "invalid"
            ? "Eintrag vorhanden, aber unvollständig"
            : status === "submitted"
              ? "Wartet auf Freigabe"
              : status === "signed"
                ? "Freigegeben"
                : "Geführt"
    };
  });
}

export function KalenderPage({ report, selectedDate, onSelectDate }) {
  const entries = report?.entries || [];
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activeDate, setActiveDate] = useState(selectedDate || "");
  const rows = buildRows(entries, visibleMonth);

  function handleSelectDate(date) {
    setActiveDate(date);
    onSelectDate(date);
  }

  function handleChangeMonth(offset) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Kalender"
        title="Monatsansicht"
        subtitle="Dokumentierte Tage, Lücken und Statuskennzeichnungen im Überblick."
      />
      <CalendarGrid
        entries={entries}
        month={visibleMonth}
        selectedDate={activeDate}
        onChangeMonth={handleChangeMonth}
        onSelectDate={handleSelectDate}
      />
      <section className="panel-card">
        <PageHeader
          kicker="Tabellarische Prüfung"
          title="Monatsübersicht"
          subtitle="Ein Tag gilt nur dann als geführt, wenn Titel, Datum und mindestens Betrieb oder Berufsschule vorhanden sind."
        />
        <div className="mobile-records">
          {rows.length ? (
            rows.map((row) => (
              <button key={row.id} type="button" className="mobile-record-card" onClick={() => handleSelectDate(row.id)}>
                <div className="mobile-record-head">
                  <strong>{row.day}</strong>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mobile-record-body">
                  <span>{row.title}</span>
                  <small>{row.type}</small>
                  <small>{row.note}</small>
                </div>
              </button>
            ))
          ) : (
            <EmptyState title="Keine Kalendereinträge" description="Für diesen Monat sind noch keine Tage vorhanden." />
          )}
        </div>
        <DataTable
          rowKey="id"
          rows={rows}
          onRowClick={(row) => handleSelectDate(row.id)}
          columns={[
            { key: "day", label: "Tag" },
            { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
            { key: "title", label: "Titel" },
            { key: "type", label: "Typ" },
            { key: "note", label: "Hinweis" }
          ]}
        />
      </section>
    </div>
  );
}
