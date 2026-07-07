import { cache } from "react";

import { redirect } from "next/navigation";

import type { ProfileStatus, Role } from "@/lib/domain/types";
import { config } from "@/lib/env";

const getCreateClient = async () => (await import("@/lib/supabase/server")).createClient();
const getCreateAdminClient = async () =>
  (await import("@/lib/supabase/admin")).createAdminClient();

export type AuthenticatedPortalUser = {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  status: ProfileStatus;
  avatarUrl?: string | null;
  ambassadorStatus?: string | null;
};

type PortalScope = "school" | "ambassador" | "staff" | "super_admin";
export type PublicAuthMode = "login" | "signup" | "forgot";
export type PublicAuthRole = "school" | "ambassador";

export const PUBLIC_AUTH_QUERY_KEYS = [
  "auth",
  "role",
  "error",
  "checkEmail",
  "reset",
  "loggedOut",
  "verified",
  "application",
  "sent"
] as const;

export function buildAbsoluteUrl(path: string) {
  return new URL(path, config.siteUrl).toString();
}

export function buildAuthConfirmUrl(nextPath: string) {
  return buildAbsoluteUrl(`/auth/confirm?next=${encodeURIComponent(nextPath)}`);
}

export function portalPathForRole(role: Role) {
  if (role === "school") {
    return "/school";
  }

  if (role === "ambassador") {
    return "/ambassador";
  }

  if (role === "staff") {
    return "/staff";
  }

  return "/admin";
}

export function sanitizePublicAuthReturnPath(path?: string | null) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }

  const [pathname, queryString] = path.split("?");
  const params = new URLSearchParams(queryString ?? "");

  for (const key of PUBLIC_AUTH_QUERY_KEYS) {
    params.delete(key);
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function buildPublicAuthPath(
  returnTo: string | null | undefined,
  {
    auth,
    role,
    error,
    checkEmail,
    reset,
    loggedOut,
    verified,
    application,
    sent
  }: {
    auth: PublicAuthMode;
    role?: PublicAuthRole;
    error?: string | null;
    checkEmail?: string | null;
    reset?: string | null;
    loggedOut?: string | null;
    verified?: string | null;
    application?: string | null;
    sent?: string | null;
  }
) {
  const sanitized = sanitizePublicAuthReturnPath(returnTo);
  const [pathname, queryString] = sanitized.split("?");
  const params = new URLSearchParams(queryString ?? "");

  params.set("auth", auth);

  if (role) {
    params.set("role", role);
  } else {
    params.delete("role");
  }

  const optionalValues = {
    error,
    checkEmail,
    reset,
    loggedOut,
    verified,
    application,
    sent
  } satisfies Record<string, string | null | undefined>;

  for (const [key, value] of Object.entries(optionalValues)) {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

// cache() dedupes this within a single render pass, so a page plus the server
// actions it triggers verify the session once instead of once each. getClaims
// verifies the JWT locally (no Supabase Auth round-trip on projects with
// asymmetric signing keys) while still refreshing expired sessions.
export const getAuthenticatedPortalUser = cache(async () => {
  if (!config.isSupabaseConfigured) {
    return null;
  }

  const supabase = await getCreateClient();

  if (!supabase) {
    return null;
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (!claims?.sub) {
    return null;
  }

  const claimsEmail = (claims.email as string | undefined) ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role, status, avatar_url")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  // The approval check must not depend on the user's own RLS visibility, so
  // read it with the service-role client when available.
  const ambassadorResult =
    profile.role === "ambassador"
      ? await getCreateAdminClient().then((adminClient) =>
          (adminClient ?? supabase)
            .from("ambassador_profiles")
            .select("status")
            .eq("user_id", claims.sub)
            .maybeSingle()
        )
      : { data: null, error: null };

  return {
    id: profile.id as string,
    email: (profile.email as string) ?? claimsEmail,
    fullName: (profile.full_name as string) ?? claimsEmail ?? "Portal user",
    phone: (profile.phone as string | null) ?? null,
    role: profile.role as Role,
    status: profile.status as ProfileStatus,
    avatarUrl: (profile.avatar_url as string | null) ?? null,
    ambassadorStatus: (ambassadorResult.data?.status as string | undefined) ?? null
  } satisfies AuthenticatedPortalUser;
});

function isPortalScopeAllowed(user: AuthenticatedPortalUser, scope: PortalScope) {
  if (scope === "school") {
    return user.role === "school";
  }

  if (scope === "ambassador") {
    return user.role === "ambassador" && user.ambassadorStatus === "approved";
  }

  if (scope === "staff") {
    return user.role === "staff" || user.role === "super_admin";
  }

  return user.role === "super_admin";
}

export async function requirePortalAccess(scope: PortalScope) {
  if (!config.isSupabaseConfigured) {
    return {
      id: `demo-${scope}`,
      email: "demo@example.com",
      fullName: scope === "super_admin" ? "Jordan Lee" : "Jordan Lee",
      phone: null,
      role: scope === "super_admin" ? "super_admin" : scope,
      status: "active" as const,
      avatarUrl: null,
      ambassadorStatus: scope === "ambassador" ? "approved" : null
    };
  }

  const user = await getAuthenticatedPortalUser();

  if (!user) {
    redirect("/login?error=auth-required");
  }

  if (user.status !== "active") {
    redirect("/login?error=account-inactive");
  }

  if (scope === "ambassador" && user.role === "ambassador" && user.ambassadorStatus !== "approved") {
    redirect("/login?error=ambassador-pending");
  }

  if (!isPortalScopeAllowed(user, scope)) {
    redirect(portalPathForRole(user.role));
  }

  return user;
}

