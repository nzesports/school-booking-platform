import type { ReactNode } from "react";
import type { Metadata } from "next";

import { submitBookingRequestAction } from "@/app/actions";
import {
  forgotPasswordAction,
  loginWithPasswordAction,
  registerAmbassadorAccountAction,
  registerSchoolAccountAction
} from "@/app/auth/actions";
import { DemoModeBanner } from "@/components/site/demo-mode-banner";
import { AppChrome } from "@/components/site/app-chrome";
import { config } from "@/lib/env";
import { loadAvailabilityConfig } from "@/lib/services/availability-server";
import { listPublicPresentations, listRegions } from "@/lib/services/presentations";

import "./globals.css";

export const metadata: Metadata = {
  title: "NZ Esports School Booking Platform",
  description:
    "A booking and operations platform for NZ Esports school presentations."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  const [presentations, regions, availabilityConfig] = await Promise.all([
    listPublicPresentations(),
    listRegions(),
    loadAvailabilityConfig()
  ]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--page-background)] text-[color:var(--text-dark)] antialiased">
        <DemoModeBanner />
        <AppChrome
          presentations={presentations}
          regions={regions}
          availabilityConfig={availabilityConfig}
          bookingAction={submitBookingRequestAction}
          loginAction={loginWithPasswordAction}
          registerSchoolAction={registerSchoolAccountAction}
          registerAmbassadorAction={registerAmbassadorAccountAction}
          forgotPasswordAction={forgotPasswordAction}
          authEnabled={config.isSupabaseConfigured}
        >
          {children}
        </AppChrome>
      </body>
    </html>
  );
}
