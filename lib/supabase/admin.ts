import { createClient } from "@supabase/supabase-js";

import { config } from "@/lib/env";

export function createAdminClient() {
  if (!config.isSupabaseAdminConfigured) {
    return null;
  }

  return createClient(
    config.supabaseUrl as string,
    config.supabaseServiceRoleKey as string,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
