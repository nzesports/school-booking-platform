import { config } from "@/lib/env";

export function DemoModeBanner() {
  if (config.isSupabaseConfigured) {
    return null;
  }

  return (
    <div className="border-b border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-2 text-center text-xs font-medium text-[color:var(--navy)]">
      Demo mode is active. Add Supabase, Brevo, and Microsoft Graph credentials to turn
      live persistence and integrations on.
    </div>
  );
}
