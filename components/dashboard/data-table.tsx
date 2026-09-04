import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dataTableHeadingClassName =
  "text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]";

export function DataTable({
  title,
  columns,
  rows,
  headerContent,
  footerContent,
  emptyMessage = "No records to show."
}: {
  title: string;
  columns: string[];
  rows: ReactNode[][];
  headerContent?: ReactNode;
  footerContent?: ReactNode;
  emptyMessage?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between gap-3",
          headerContent ? "mb-6" : "mb-5"
        )}
      >
        <h2 className={dataTableHeadingClassName}>
          {title}
        </h2>
        <div className="rounded-full border border-[color:var(--border-soft)] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
          Live view
        </div>
      </div>
      {headerContent ? <div className="mb-5">{headerContent}</div> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-4 pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="rounded-[22px] bg-white/92 px-4 py-8 text-center text-sm text-[color:var(--text-soft)] shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
            {rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                className="rounded-[22px] bg-white/92 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${rowIndex}-${cellIndex}`}
                    className={cn(
                      "align-middle px-4 py-4 text-sm text-[color:var(--text-dark)]",
                      cellIndex === 0 && "rounded-l-[22px] font-semibold text-[color:var(--navy)]",
                      cellIndex === row.length - 1 && "rounded-r-[22px]"
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footerContent ? (
        <div className="mt-5 border-t border-[color:var(--border-soft)] pt-4">
          {footerContent}
        </div>
      ) : null}
    </Card>
  );
}
