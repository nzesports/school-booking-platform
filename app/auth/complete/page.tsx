"use client";

import { useEffect } from "react";

import { Card } from "@/components/ui/card";
import { config } from "@/lib/env";
import { createClient } from "@/lib/supabase/browser";

/**
 * Completes sign-in for Supabase email links (invites, resets) that return
 * the session in the URL fragment. Server routes never see fragments, so
 * /auth/confirm forwards those links here to be finished in the browser.
 */
export default function AuthCompletePage() {
  useEffect(() => {
    const completeSignIn = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryParams = new URLSearchParams(window.location.search);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type");
      const rawNext = queryParams.get("next") || "/";
      const next = rawNext.startsWith("/") ? rawNext : "/";

      if (!config.isSupabaseConfigured || !accessToken || !refreshToken) {
        window.location.replace("/login?error=invalid-confirm-link");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (error) {
        window.location.replace("/login?error=confirm-failed");
        return;
      }

      const destination =
        type === "invite" && next.startsWith("/reset-password")
          ? `${next}${next.includes("?") ? "&" : "?"}welcome=1`
          : next;

      // Full navigation so the server render sees the freshly set cookies.
      window.location.replace(destination);
    };

    void completeSignIn();
  }, []);

  return (
    <main className="site-shell-narrow flex min-h-[70vh] items-center justify-center py-20">
      <Card className="w-full max-w-xl rounded-[34px] text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          One moment
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-[color:var(--navy)]">
          Confirming your link...
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-soft)]">
          We&apos;re signing you in securely. This should only take a second.
        </p>
      </Card>
    </main>
  );
}
