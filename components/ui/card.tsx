import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={cn(
        "surface-panel rounded-[32px] p-6 md:p-7",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
