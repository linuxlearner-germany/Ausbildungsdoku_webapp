import React from "react";

export function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
