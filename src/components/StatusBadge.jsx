import React from "react";

const labels = {
  draft: "Entwurf",
  submitted: "Eingereicht",
  signed: "Signiert",
  rejected: "Abgelehnt",
  missing: "Nicht geführt",
  invalid: "Unvollständig"
};

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}
