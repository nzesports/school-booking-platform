import { redirect } from "next/navigation";

import type { PortalNotification, ProfileStatus, Role } from "@/lib/domain/types";
import { config } from "@/lib/env";

const getCreateClient = async () => (await import("@/lib/supabase/server")).createClient();
const getCreateAdminClient = async () =>
  (await import("@/lib/supabase/admin")).createAdminClient();

export type AuthenticatedPortalUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: ProfileStatus;
  notificationCount: number;
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

export async function getAuthenticatedPortalUser() {
  if (!config.isSupabaseConfigured) {
    return null;
  }

  const supabase = await getCreateClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const notificationCountPromise = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null)
    .is("resolved_at", null);

  // The approval check must not depend on the user's own RLS visibility, so
  // read it with the service-role client when available.
  const ambassadorStatusPromise =
    profile.role === "ambassador"
      ? getCreateAdminClient().then((adminClient) =>
          (adminClient ?? supabase)
            .from("ambassador_profiles")
            .select("status")
            .eq("user_id", user.id)
            .maybeSingle()
        )
      : Promise.resolve({ data: null, error: null });

  const [{ count }, ambassadorResult] = await Promise.all([
    notificationCountPromise,
    ambassadorStatusPromise
  ]);

  return {
    id: profile.id as string,
    email: (profile.email as string) ?? user.email ?? "",
    fullName: (profile.full_name as string) ?? user.email ?? "Portal user",
    role: profile.role as Role,
    status: profile.status as ProfileStatus,
    ambassadorStatus: (ambassadorResult.data?.status as string | undefined) ?? null,
    notificationCount: count ?? 0
  } satisfies AuthenticatedPortalUser;
}

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
      role: scope === "super_admin" ? "super_admin" : scope,
      status: "active" as const,
      ambassadorStatus: scope === "ambassador" ? "approved" : null,
      notificationCount: 3
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

export async function listMyNotifications(limit = 20): Promise<PortalNotification[]> {
  if (!config.isSupabaseConfigured) {
    return [];
  }

  const supabase = await getCreateClient();

  if (!supabase) {
    return [];
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, notification_type, related_url, read_at, resolved_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((notification) => ({
    id: notification.id as string,
    title: notification.title as string,
    body: (notification.body as string | null) ?? "",
    notificationType: notification.notification_type as string,
    relatedUrl: (notification.related_url as string | null) ?? undefined,
    readAt: (notification.read_at as string | null) ?? null,
    resolvedAt: (notification.resolved_at as string | null) ?? null,
    createdAt: notification.created_at as string
  }));
}
