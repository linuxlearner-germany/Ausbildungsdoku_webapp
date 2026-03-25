import React from "react";
import { StatusBadge } from "./StatusBadge";
import { PrimaryButton } from "./PrimaryButton";

function validateEntry(entry) {
  if (!entry) return false;
  return !!entry.weekLabel && !!entry.dateFrom && (!!entry.betrieb || !!entry.schule);
}

function dayStatus(entry) {
  if (!entry) return "missing";
  if (!validateEntry(entry)) return "invalid";
  return entry.status;
}

export function CalendarGrid({ entries, month, selectedDate, onChangeMonth, onSelectDate, variant = "default" }) {
  const label = month.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const firstGridDay = new Date(month);
  const weekday = (firstGridDay.getDay() + 6) % 7;
  firstGridDay.setDate(firstGridDay.getDate() - weekday);

  function entryByDay(isoDate) {
    return entries.find((entry) => entry.dateFrom === isoDate);
  }

  return (
    <section className={`panel-card calendar-panel calendar-panel-${variant}`}>
      <div className="panel-header">
        <div className="calendar-panel-head">
          <div>
            <p className="page-kicker">Kalender</p>
            <h3>{label}</h3>
            <p className="page-subtitle">Tage mit Berichten sind direkt anklickbar. Leere, offene und freigegebene Tage werden klar getrennt dargestellt.</p>
          </div>
          <div className="calendar-month-switcher">
            <PrimaryButton variant="secondary" onClick={() => onChangeMonth(-1)}>Zurueck</PrimaryButton>
            <PrimaryButton variant="secondary" onClick={() => onSelectDate(new Date().toISOString().slice(0, 10))}>Heute</PrimaryButton>
            <PrimaryButton variant="secondary" onClick={() => onChangeMonth(1)}>Weiter</PrimaryButton>
          </div>
        </div>
      </div>
      <div className="calendar-grid calendar-grid-enterprise">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((weekdayLabel) => (
          <div key={weekdayLabel} className="calendar-weekday">
            {weekdayLabel}
          </div>
        ))}
        {Array.from({ length: 42 }).map((_, index) => {
          const date = new Date(firstGridDay);
          date.setDate(firstGridDay.getDate() + index);
          const iso = date.toISOString().slice(0, 10);
          const entry = entryByDay(iso);
          const status = dayStatus(entry);
          return (
            <button
              key={iso}
              type="button"
              className={`calendar-tile status-${status}${selectedDate === iso ? " selected" : ""}${date.getMonth() !== month.getMonth() ? " outside" : ""}`}
              onClick={() => onSelectDate(iso)}
            >
              <div className="calendar-tile-top">
                <span className="calendar-tile-day">{date.getDate()}</span>
                {entry ? <StatusBadge status={status} /> : <span className="calendar-tile-empty-label">Leer</span>}
              </div>
              <div className="calendar-tile-body">
                <strong>{entry?.weekLabel || "Kein Bericht"}</strong>
                <small>
                  {entry
                    ? entry.betrieb && entry.schule
                      ? "Betrieb und Berufsschule"
                      : entry.betrieb
                        ? "Betrieb"
                        : entry.schule
                          ? "Berufsschule"
                          : "Noch unvollstaendig"
                    : "Neuen Bericht anlegen"}
                </small>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
