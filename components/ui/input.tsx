import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm text-[color:var(--text-dark)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)] outline-none transition placeholder:text-[color:var(--text-soft)] focus:border-[color:rgba(24,168,59,0.34)] focus:ring-4 focus:ring-[rgba(24,168,59,0.1)]",
        className
      )}
      {...props}
    />
  );
}
