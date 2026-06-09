"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { BookingModalHost } from "@/components/site/booking-modal-host";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import type { PresentationType, Region } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const portalPrefixes = ["/school", "/ambassador", "/staff", "/admin"];

export function AppChrome({
  children,
  presentations,
  regions,
  bookingAction
}: {
  children: ReactNode;
  presentations: PresentationType[];
  regions: Region[];
  bookingAction: (formData: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname();
  const isPortalRoute = portalPrefixes.some((prefix) => pathname.startsWith(prefix));

  return (
    <div className={cn("relative min-h-screen overflow-hidden", isPortalRoute ? "portal-surface" : "marketing-surface")}>
      {!isPortalRoute ? <SiteHeader /> : null}
      <div className="relative z-10">{children}</div>
      {!isPortalRoute ? <SiteFooter /> : null}
      {!isPortalRoute ? (
        <Suspense fallback={null}>
          <BookingModalHost presentations={presentations} regions={regions} action={bookingAction} />
        </Suspense>
      ) : null}
    </div>
  );
}
