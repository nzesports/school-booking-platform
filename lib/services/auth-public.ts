// Vercel system env vars are host-only (no protocol) and only defined
// server-side; client bundles fall through to the localhost default, which is
// fine because buildAbsoluteUrl is only called from server code.
const vercelUrl =
  process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000");

type PublicAuthMode = "login" | "signup" | "forgot";
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
  return new URL(path, siteUrl).toString();
}

export function buildAuthConfirmUrl(nextPath: string) {
  return buildAbsoluteUrl(`/auth/confirm?next=${encodeURIComponent(nextPath)}`);
}

export function portalPathForRole(role: "school" | "ambassador" | "staff" | "super_admin") {
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
