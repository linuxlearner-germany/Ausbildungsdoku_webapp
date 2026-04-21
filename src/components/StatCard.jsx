import React from "react";

export function StatCard({ label, value, note }) {
  return (
    <article className="stat-card border rounded-3">
      <span className="text-uppercase small fw-semibold text-secondary">{label}</span>
      <strong className="display-6 fw-semibold mb-1">{value}</strong>
      <span className="text-secondary small">{note}</span>
    </article>
  );
}
