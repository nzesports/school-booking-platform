"use client";

import type { ButtonProps } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  return (
    <PendingSubmitButton {...props} pendingLabel={pendingLabel}>
      {children}
    </PendingSubmitButton>
  );
}
