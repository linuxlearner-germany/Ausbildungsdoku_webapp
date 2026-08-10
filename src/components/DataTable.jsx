import React from "react";

export function DataTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
  emptyTitle = "Keine Einträge vorhanden.",
  emptyDescription = "",
  tableClassName = ""
}) {
  if (!rows.length) {
    return (
      <div className="empty-table" role="status">
        <strong>{emptyTitle}</strong>
        {emptyDescription ? <span>{emptyDescription}</span> : null}
      </div>
    );
  }

  return (
    <div className="table-responsive table-shell">
      <table className={`table table-hover align-middle mb-0 data-table ${tableClassName}`.trim()}>
        {caption ? <caption>{caption}</caption> : null}
        <colgroup>
          {columns.map((column) => <col key={column.key} style={column.width ? { width: column.width } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.className || undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[rowKey]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowClick(row);
                }
              } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick ? "Eintrag öffnen" : undefined}
              className={onRowClick ? "is-clickable" : ""}
            >
              {columns.map((column) => (
                <td key={column.key} className={column.className || undefined}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
