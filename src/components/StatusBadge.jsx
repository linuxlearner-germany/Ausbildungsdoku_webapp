import React from "react";

const labels = {
  draft: "Entwurf",
  submitted: "Eingereicht",
  signed: "Signiert",
  rejected: "Nachbearbeitung",
  missing: "Leer",
  invalid: "Unvollstaendig"
};

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}
