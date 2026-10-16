import type { TextareaHTMLAttributes } from "react";

import { TEXTAREA_BASE } from "@/components/ui/field-base";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        TEXTAREA_BASE,
        className
      )}
      {...props}
    />
  );
}
