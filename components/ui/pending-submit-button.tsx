"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

export function PendingSubmitButton({
  children,
  pendingLabel = "Working...",
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} disabled={pending || props.disabled} aria-disabled={pending || props.disabled}>
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      <span className="inline-flex items-center gap-2" aria-live="polite">
        {pending ? pendingLabel : children}
      </span>
    </Button>
  );
}
