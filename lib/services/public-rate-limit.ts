import { headers } from "next/headers";

import { config } from "@/lib/env";
import { privateRateKey } from "@/lib/services/booking-access-security";
import { createAdminClient } from "@/lib/supabase/admin";

// Hourly request budget for public (signed-out) forms, backed by the same
// allow_booking_access_request counter as /manage-booking. Keys are HMACed so
// raw IPs and emails are never stored. Fails open: a rate-limit outage must
// not block genuine bookings, so it only logs.
export async function allowPublicRequest(kind: string, value: string, limit: number) {
  const admin = createAdminClient();

  if (!admin || !config.supabaseServiceRoleKey) {
    return true;
  }

  const { data, error } = await admin.rpc("allow_booking_access_request", {
    p_key: privateRateKey(`public:${kind}`, value.trim().toLowerCase(), config.supabaseServiceRoleKey),
    p_limit: limit
  });

  if (error) {
    console.error("[public-rate-limit] Rate limit unavailable", { kind, code: error.code });
    return true;
  }

  return data === true;
}

export async function publicClientAddress() {
  // Only trust the forwarding header where the hosting edge overwrites it.
  return process.env.VERCEL === "1"
    ? (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "shared-local";
}
