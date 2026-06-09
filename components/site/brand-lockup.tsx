import Link from "next/link";

import { cn } from "@/lib/utils";

export function BrandLockup({
  className,
  subtitle,
  compact = false
}: {
  className?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-3", className)}>
      <div className="flex h-11 min-w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#eaf8ee,#eef7fc)] px-2.5 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.08)]">
        <span className="bg-[linear-gradient(135deg,var(--green),var(--navy))] bg-clip-text text-2xl font-black tracking-[-0.08em] text-transparent">
          NZ
        </span>
      </div>
      <div className="grid gap-0.5">
        <span className="text-xl font-black tracking-[-0.04em] text-[color:var(--navy)]">
          ESPORTS
        </span>
        {!compact ? (
          <span className="text-xs font-medium text-[color:var(--text-soft)]">
            {subtitle ?? "School presentations"}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
