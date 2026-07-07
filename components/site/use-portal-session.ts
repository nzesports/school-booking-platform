"use client";

import { useEffect, useState } from "react";

import { config } from "@/lib/env";
import { createClient } from "@/lib/supabase/browser";

const PORTAL_PATHS: Record<string, string> = {
  school: "/school",
  ambassador: "/ambassador",
  staff: "/staff",
  super_admin: "/admin"
};

// Checks (client-side) whether the visitor has a live portal session and
// which portal it belongs to, so public pages can show a "My portal" link
// instead of pretending the user is logged out. Public pages stay
// static/cacheable because the check happens in the browser.
export function usePortalSession() {
  const [portalPath, setPortalPath] = useState<string | null>(null);

  useEffect(() => {
    if (!config.isSupabaseConfigured) {
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    const resolve = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        if (!cancelled) {
          setPortalPath(null);
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!cancelled) {
        setPortalPath(PORTAL_PATHS[(profile?.role as string) ?? ""] ?? null);
      }
    };

    void resolve();

    // Keep the header in sync when the user logs in/out in this or another tab.
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(() => {
      void resolve();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return portalPath;
}
