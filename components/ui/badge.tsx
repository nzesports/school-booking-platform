import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold capitalize tracking-[0.02em]",
        className
      )}
      {...props}
    />
  );
}
