import type { SelectHTMLAttributes } from "react";

import { FIELD_BASE } from "@/components/ui/field-base";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        FIELD_BASE,
        className
      )}
      {...props}
    />
  );
}
