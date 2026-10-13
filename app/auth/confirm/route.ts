import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/env";
import { safeLocalPath } from "@/lib/safe-redirect";

function withWelcomeFlag(next: string, type: string | null) {
  if (type === "invite" && next.startsWith("/reset-password")) {
    return `${next}${next.includes("?") ? "&" : "?"}welcome=1`;
  }

  return next;
}

type OtpType = "signup" | "recovery" | "invite" | "email_change";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next") ?? "/login";
  const next = safeLocalPath(rawNext, "/login");

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

  // One-time email tokens are only used when a person presses Continue (a
  // POST back to this route). Email security scanners open links with GET,
  // and verifying here would use up the link before the recipient sees it.
  if (tokenHash) {
    const continueUrl = new URL("/auth/continue", requestUrl.origin);
    continueUrl.searchParams.set("token_hash", tokenHash);
    continueUrl.searchParams.set("type", type ?? "signup");
    continueUrl.searchParams.set("next", next);
    return NextResponse.redirect(continueUrl);
  }

  return completeVerification(request, next, type, (supabase) =>
    supabase.auth.exchangeCodeForSession(code as string)
  );
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const tokenHash = String(formData.get("token_hash") || "");
  const type = String(formData.get("type") || "signup");
  const next = safeLocalPath(String(formData.get("next") || "/login"), "/login");

  if (!config.isSupabaseConfigured || !tokenHash) {
    return NextResponse.redirect(new URL("/login?error=invalid-confirm-link", request.url), 303);
  }

  return completeVerification(request, next, type, (supabase) =>
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as OtpType })
  );
}

async function completeVerification(
  request: NextRequest,
  next: string,
  type: string | null,
  verify: (
    supabase: ReturnType<typeof createServerClient>
  ) => Promise<{ error: unknown }>
) {
  // 303 so a POST from the Continue page is followed with a GET.
  const response = NextResponse.redirect(
    new URL(withWelcomeFlag(next, type), request.url),
    303
  );

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

  const { error } = await verify(supabase);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=confirm-failed", request.url), 303);
  }

  return response;
}
