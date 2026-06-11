import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/env";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") ?? "/login";
  const redirectUrl = new URL(next, requestUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  if (!config.isSupabaseConfigured || !tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=invalid-confirm-link", request.url));
  }

  const supabase = createServerClient(
    config.supabaseUrl as string,
    config.supabasePublishableKey as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(items) {
          items.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "signup" | "recovery" | "invite" | "email_change"
  });

  if (error) {
    return NextResponse.redirect(new URL("/login?error=confirm-failed", request.url));
  }

  return response;
}
