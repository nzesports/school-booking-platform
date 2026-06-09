import type { ReactNode } from "react";
import type { Metadata } from "next";

import { submitBookingRequestAction } from "@/app/actions";
import { DemoModeBanner } from "@/components/site/demo-mode-banner";
import { AppChrome } from "@/components/site/app-chrome";
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
  const [presentations, regions] = await Promise.all([
    listPublicPresentations(),
    listRegions()
  ]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--page-background)] text-[color:var(--text-dark)] antialiased">
        <DemoModeBanner />
        <AppChrome
          presentations={presentations}
          regions={regions}
          bookingAction={submitBookingRequestAction}
        >
          {children}
        </AppChrome>
      </body>
    </html>
  );
}
