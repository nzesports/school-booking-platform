"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function BookPresentationButton({
  children,
  className,
  variant = "primary",
  presentationSlug,
  regionSlug,
  date,
  time,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  presentationSlug?: string;
  regionSlug?: string;
  date?: string;
  time?: string;
}) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const pathname = window.location.pathname;
        params.set("booking", "1");

        if (presentationSlug) {
          params.set("presentation", presentationSlug);
        } else {
          params.delete("presentation");
        }

        if (regionSlug) {
          params.set("region", regionSlug);
        } else {
          params.delete("region");
        }

        if (date) {
          params.set("date", date);
        } else {
          params.delete("date");
        }

        if (time) {
          params.set("time", time);
        } else {
          params.delete("time");
        }

        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
