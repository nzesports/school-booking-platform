"use client";

import type { ReactNode } from "react";

import {
  useAuthModal,
  type AuthModalMode,
  type AuthModalRole
} from "@/components/auth/auth-modal-provider";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AuthModalButton({
  children,
  mode,
  role,
  ...props
}: ButtonProps & {
  children: ReactNode;
  mode: AuthModalMode;
  role?: AuthModalRole;
}) {
  const { openAuth } = useAuthModal();

  return (
    <Button
      {...props}
      onClick={(event) => {
        props.onClick?.(event);

        if (!event.defaultPrevented) {
          openAuth({ mode, role });
        }
      }}
    >
      {children}
    </Button>
  );
}

export function AuthModalInlineButton({
  children,
  className,
  mode,
  role
}: {
  children: ReactNode;
  className?: string;
  mode: AuthModalMode;
  role?: AuthModalRole;
}) {
  const { openAuth } = useAuthModal();

  return (
    <button
      type="button"
      onClick={() => openAuth({ mode, role })}
      className={cn("font-semibold text-[color:var(--navy)]", className)}
    >
      {children}
    </button>
  );
}
