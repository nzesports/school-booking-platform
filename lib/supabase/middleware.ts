import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  if (!config.isSupabaseConfigured) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    config.supabaseUrl as string,
    config.supabasePublishableKey as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(items) {
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // getClaims still refreshes an expired session (and persists the new
  // cookies), but verifies a live JWT locally when the project has asymmetric
  // signing keys — getUser paid a Supabase Auth round-trip on every request.
  await supabase.auth.getClaims();

  return response;
}
