import React from "react";

const labels = {
  draft: "Entwurf",
  submitted: "Eingereicht",
  signed: "Signiert",
  rejected: "Nachbearbeitung",
  missing: "Leer",
  invalid: "Unvollständig"
};

export function StatusBadge({ status }) {
  return (
    <span className={`status-badge badge rounded-pill text-uppercase status-${status}`} aria-label={`Status: ${labels[status] || status}`}>
      {status === "signed" ? (
        <svg className="status-badge-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8 3 3 6-6" /></svg>
      ) : null}
      {labels[status] || status}
    </span>
  );
}
