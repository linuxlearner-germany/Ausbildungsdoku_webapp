import React from "react";

export function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state border rounded-3 bg-body">
      <strong className="d-block mb-2">{title}</strong>
      {description ? <p className="text-secondary mb-3">{description}</p> : null}
      {action}
    </div>
  );
}
