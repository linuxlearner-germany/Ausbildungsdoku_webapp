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
  return <span className={`status-badge badge rounded-pill text-uppercase status-${status}`}>{labels[status] || status}</span>;
}
