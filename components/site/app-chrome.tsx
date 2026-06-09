"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { cn } from "@/lib/utils";

const portalPrefixes = ["/school", "/ambassador", "/staff", "/admin"];

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPortalRoute = portalPrefixes.some((prefix) => pathname.startsWith(prefix));

  return (
    <div className={cn("relative min-h-screen overflow-hidden", isPortalRoute ? "portal-surface" : "marketing-surface")}>
      {!isPortalRoute ? <SiteHeader /> : null}
      <div className="relative z-10">{children}</div>
      {!isPortalRoute ? <SiteFooter /> : null}
    </div>
  );
}
