"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useBookingModal } from "@/components/site/booking-modal-provider";
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
  const bookingModal = useBookingModal();

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

        if (bookingModal) {
          bookingModal.openBooking({
            initialStep: "plan",
            presentationSlug,
            regionSlug,
            date,
            time
          });
          return;
        }

        router.push(
          presentationSlug ? `/book/${presentationSlug}` : "/book",
          { scroll: false }
        );
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
