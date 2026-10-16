import type { InputHTMLAttributes } from "react";

import { FIELD_BASE } from "@/components/ui/field-base";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        FIELD_BASE,
        className
      )}
      {...props}
    />
  );
}
