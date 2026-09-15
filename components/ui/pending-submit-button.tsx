"use client";

import { Button, type ButtonProps } from "@/components/ui/button";

export function PendingSubmitButton({
  type = "submit",
  pendingLabel = "Working…",
  ...props
}: ButtonProps) {
  return <Button {...props} type={type} pendingLabel={pendingLabel} />;
}
