import React from "react";
import { StatusBadge } from "./StatusBadge";
import { PrimaryButton } from "./PrimaryButton";
import { buildCalendarGridDates, formatLocalDate, getTodayLocalDateString, parseLocalDate, startOfLocalMonth } from "../lib/date.mjs";

function validateEntry(entry) {
  if (!entry) return false;
  return !!entry.weekLabel && !!entry.dateFrom && (!!entry.betrieb || !!entry.schule);
}

function dayStatus(entry) {
  if (!entry) return "missing";
  if (!validateEntry(entry)) return "invalid";
  return entry.status;
}

export function CalendarGrid({
  entries,
  month,
  selectedDate,
  onChangeMonth,
  onSelectDate,
  onOpenDate,
  selectableEntryIds = [],
  selectedEntryIds = [],
  onToggleEntrySelection = null,
  enableDesktopDoubleClick = false,
  variant = "default"
}) {
  const label = formatLocalDate(month, { month: "long", year: "numeric" });
  const monthStart = startOfLocalMonth(month);
  const gridDates = buildCalendarGridDates(monthStart);
  const selectableIds = new Set(selectableEntryIds);
  const selectedIds = new Set(selectedEntryIds);

  function entryByDay(isoDate) {
    return entries.find((entry) => entry.dateFrom === isoDate);
  }

  function handleTileClick(isoDate, event) {
    if (enableDesktopDoubleClick && event.detail > 1) {
      return;
    }
    onSelectDate(isoDate);
  }

  function handleTileDoubleClick(isoDate) {
    if (!enableDesktopDoubleClick || !onOpenDate) {
      return;
    }
    onOpenDate(isoDate);
  }

  return (
    <section className={`panel-card calendar-panel calendar-panel-${variant}`}>
      <div className="panel-header">
        <div className="calendar-panel-head">
          <div>
            <p className="page-kicker">Kalender</p>
            <h3>{label}</h3>
          </div>
          <div className="calendar-month-switcher">
            <PrimaryButton variant="secondary" onClick={() => onChangeMonth(-1)}>Zurück</PrimaryButton>
            <PrimaryButton variant="secondary" onClick={() => onSelectDate(getTodayLocalDateString())}>Heute</PrimaryButton>
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
        {gridDates.map((iso) => {
          const entry = entryByDay(iso);
          const status = dayStatus(entry);
          const date = parseLocalDate(iso);
          const isSelectable = Boolean(entry?.id && selectableIds.has(entry.id) && onToggleEntrySelection);
          const isSelected = Boolean(entry?.id && selectedIds.has(entry.id));
          return (
            <article
              key={iso}
              className={`calendar-tile-shell${date.getMonth() !== month.getMonth() ? " outside" : ""}${isSelected ? " is-selected" : ""}`}
            >
              {isSelectable ? (
                <div className="calendar-selection-bar">
                  <label className="selection-check">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleEntrySelection(entry.id)}
                    />
                    <span>{isSelected ? "Ausgewählt" : "Auswählen"}</span>
                  </label>
                </div>
              ) : null}
              <button
                type="button"
                className={`calendar-tile status-${status}${selectedDate === iso ? " selected" : ""}${date.getMonth() !== month.getMonth() ? " outside" : ""}`}
                onClick={(event) => handleTileClick(iso, event)}
                onDoubleClick={() => handleTileDoubleClick(iso)}
              >
                <div className="calendar-tile-top">
                  <div className="calendar-tile-day-row">
                    <span className="calendar-tile-day">{date.getDate()}</span>
                  </div>
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
                            : "Noch unvollständig"
                      : "Neuen Bericht anlegen"}
                  </small>
                </div>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
