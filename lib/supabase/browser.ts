import { createBrowserClient } from "@supabase/ssr";

import { config } from "@/lib/env";

export function createClient() {
  if (!config.isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  return createBrowserClient(
    config.supabaseUrl as string,
    config.supabasePublishableKey as string
  );
}
