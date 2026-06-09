import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DataTable({
  title,
  columns,
  rows
}: {
  title: string;
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {title}
        </h2>
        <div className="rounded-full border border-[color:var(--border-soft)] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
          Live view
        </div>
      </div>
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
            {rows.map((row, rowIndex) => (
              <tr
                key={`row-${rowIndex}`}
                className="rounded-[22px] bg-white/92 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`cell-${rowIndex}-${cellIndex}`}
                    className={cn(
                      "px-4 py-4 text-sm text-[color:var(--text-dark)]",
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
    </Card>
  );
}
