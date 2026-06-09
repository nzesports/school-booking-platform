import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { config } from "@/lib/env";

export async function createClient() {
  if (!config.isSupabaseConfigured) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(
    config.supabaseUrl as string,
    config.supabasePublishableKey as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(items) {
          items.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        }
      }
    }
  );
}
