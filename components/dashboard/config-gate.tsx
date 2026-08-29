import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { config } from "@/lib/env";

function isAdminKeyMissing() {
  return config.isSupabaseConfigured && !config.isSupabaseAdminConfigured;
}

function missingIntegrations() {
  const missing: string[] = [];

  if (!config.isBrevoConfigured) {
    missing.push("transactional emails are not being sent");
  }

  if (!config.isMicrosoftGraphConfigured) {
    missing.push("calendar sync is unavailable");
  }

  return missing;
}

export function ConfigGate({
  portal,
  showIntegrationWarnings = false,
  children
}: {
  portal: string;
  showIntegrationWarnings?: boolean;
  children: ReactNode;
}) {
  if (isAdminKeyMissing()) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <Card className="max-w-xl rounded-[28px] border-[#f3c9c9] bg-[#fdf7f7] p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#fbe9e9] text-[#b3261e]">
              <TriangleAlert className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                {portal} portal is temporarily unavailable
              </h1>
              <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                We couldn&apos;t load your portal data. Please try again later or contact the NZ
                Esports team for help.
              </p>
            </div>
          </div>
        </Card>
      </main>
    );
  }

  const warnings = showIntegrationWarnings ? missingIntegrations() : [];

  return (
    <>
      {warnings.length > 0 ? (
        <div className="border-b border-[#f0dfc0] bg-[#fdf6e7] px-6 py-2.5 text-[13px] font-medium text-[#8a6116]">
          <span className="font-semibold">Some services are unavailable:</span>{" "}
          {warnings.join("; ")}. Contact the platform administrator for help.
        </div>
      ) : null}
      {children}
    </>
  );
}
