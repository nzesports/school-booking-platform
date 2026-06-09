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

  await supabase.auth.getUser();

  return response;
}
