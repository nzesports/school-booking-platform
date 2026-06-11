import type { ReactNode } from "react";

export function AuthField({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--navy)]">
          {label}
        </span>
        {hint ? <span className="text-xs text-[color:var(--text-soft)]">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}
