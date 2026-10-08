import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({ columns, rows, rowKey, emptyMessage }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  emptyMessage?: string;
}) {
  if (!rows.length) {
    return <div className="rounded border border-dashed border-border bg-white p-6 text-center text-sm text-muted">{emptyMessage || 'No data to show.'}</div>;
  }

  return (
    <div className="overflow-x-auto rounded border border-border bg-white shadow-subtle">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-page text-left text-xs font-semibold uppercase tracking-wide text-muted">
            {columns.map((col) => (
              <th key={col.key} className={`px-3 py-2 ${col.className || ''}`}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-page/60">
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-2 align-middle ${col.className || ''}`}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
