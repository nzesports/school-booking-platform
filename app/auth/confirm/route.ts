import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/env";

function withWelcomeFlag(next: string, type: string | null) {
  if (type === "invite" && next.startsWith("/reset-password")) {
    return `${next}${next.includes("?") ? "&" : "?"}welcome=1`;
  }

  return next;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next") ?? "/login";
  const next = rawNext.startsWith("/") ? rawNext : "/login";

  if (!config.isSupabaseConfigured) {
    return NextResponse.redirect(new URL("/login?error=invalid-confirm-link", request.url));
  }

  // Supabase's default email templates verify the token on their side and
  // return the session in the URL fragment, which never reaches this server
  // route. Hand those links to a client page that can read the fragment.
  if (!tokenHash && !code) {
    const completeUrl = new URL("/auth/complete", requestUrl.origin);
    completeUrl.searchParams.set("next", next);
    return NextResponse.redirect(completeUrl);
  }

  const redirectUrl = new URL(withWelcomeFlag(next, type), requestUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

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

  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: (type ?? "signup") as "signup" | "recovery" | "invite" | "email_change"
      })
    : await supabase.auth.exchangeCodeForSession(code as string);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=confirm-failed", request.url));
  }

  return response;
}
