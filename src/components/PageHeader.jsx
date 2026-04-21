import React from "react";

export function PageHeader({ kicker, title, subtitle, actions }) {
  return (
    <div className="page-header d-flex flex-column flex-lg-row align-items-lg-end justify-content-between gap-3">
      <div>
        <p className="page-kicker mb-2">{kicker}</p>
        <h2 className="mb-1">{title}</h2>
        {subtitle ? <p className="page-subtitle mb-0">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions d-flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
