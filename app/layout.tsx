import type { ReactNode } from "react";
import type { Metadata } from "next";

import { DemoModeBanner } from "@/components/site/demo-mode-banner";
import { AppChrome } from "@/components/site/app-chrome";

import "./globals.css";

export const metadata: Metadata = {
  title: "NZ Esports School Booking Platform",
  description:
    "A booking and operations platform for NZ Esports school presentations."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--page-background)] text-[color:var(--text-dark)] antialiased">
        <DemoModeBanner />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
