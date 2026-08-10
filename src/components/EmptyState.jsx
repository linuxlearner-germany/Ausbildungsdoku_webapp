import React from "react";

export function EmptyState({ title, description, action, icon = true }) {
  return (
    <div className="empty-state">
      {icon ? (
        <svg className="empty-state-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5h14v14H5zM8 9h8M8 13h5" />
        </svg>
      ) : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
