import React from "react";

export function StatCard({ label, value, note, priority = false }) {
  return (
    <article className={`stat-card${priority ? " stat-card--priority" : ""}`}>
      <span className="stat-card-label">{label}</span>
      <strong className="stat-card-value">{value}</strong>
      <span className="text-secondary small">{note}</span>
    </article>
  );
}
