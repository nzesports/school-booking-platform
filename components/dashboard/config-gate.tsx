import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { config } from "@/lib/env";

// Half-configured Supabase (auth works, service-role key missing) used to fall
// back to demo data, which made production misconfiguration look like another
// user's account. Fail loudly instead. Fully unconfigured environments keep
// the demo experience for local preview.
function isAdminKeyMissing() {
  return config.isSupabaseConfigured && !config.isSupabaseAdminConfigured;
}

function missingIntegrations() {
  const missing: { name: string; consequence: string }[] = [];

  if (!config.isBrevoConfigured) {
    missing.push({
      name: "BREVO_API_KEY",
      consequence: "transactional emails (welcome, notifications) are not being sent"
    });
  }

  if (!config.isMicrosoftGraphConfigured) {
    missing.push({
      name: "MICROSOFT_GRAPH_*",
      consequence: "calendar sync is disabled"
    });
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
                Server configuration error
              </h1>
              <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                The {portal} portal can&apos;t load real data because the{" "}
                <code className="rounded bg-[#f1e5e5] px-1.5 py-0.5 font-mono text-[13px] text-[#b3261e]">
                  SUPABASE_SERVICE_ROLE_KEY
                </code>{" "}
                environment variable is not set in this deployment. Sign-in works, but every
                portal read depends on this server-side key.
              </p>
              <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                Fix: copy the secret key from Supabase → Project Settings → API Keys into the
                deployment&apos;s environment variables, then redeploy. If you&apos;re a school or
                ambassador seeing this page, please contact the NZ Esports team.
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
          <span className="font-semibold">Config warning:</span>{" "}
          {warnings.map((warning) => `${warning.name} is not set — ${warning.consequence}`).join("; ")}
          . Only staff see this banner.
        </div>
      ) : null}
      {children}
    </>
  );
}
