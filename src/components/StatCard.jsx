import React from "react";

export function StatCard({ label, value, note }) {
  return (
    <article className="stat-card">
      <span className="stat-card-label">{label}</span>
      <strong className="stat-card-value">{value}</strong>
      <span className="text-secondary small">{note}</span>
    </article>
  );
}
