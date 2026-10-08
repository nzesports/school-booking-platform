import { createHmac, timingSafeEqual } from "node:crypto";
import "server-only";

import { config } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Online sessions are never advertised: schools book them through one private
// link the staff team shares. The link carries a signature over a version
// number kept in settings, so a super admin can replace the link (bump the
// version) and every copy already shared stops working.
export const ONLINE_BOOKING_LINK_SETTING_KEY = "online_booking_link";

function signingKey() {
  return config.supabaseServiceRoleKey ?? null;
}

export async function getOnlineBookingLinkVersion() {
  const admin = createAdminClient();

  if (!admin) {
    return 1;
  }

  const { data } = await admin
    .from("settings")
    .select("setting_value")
    .eq("setting_key", ONLINE_BOOKING_LINK_SETTING_KEY)
    .maybeSingle();
  const version = Number((data?.setting_value as Record<string, unknown> | null)?.version);

  return Number.isInteger(version) && version > 0 ? version : 1;
}

function onlineBookingToken(version: number) {
  const key = signingKey();
  return key
    ? createHmac("sha256", key).update(`online-booking:v${version}`).digest("base64url")
    : null;
}

export async function isValidOnlineBookingToken(token: string | null | undefined) {
  const expected = onlineBookingToken(await getOnlineBookingLinkVersion());

  if (!expected || !token) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);
  return expectedBuffer.length === tokenBuffer.length && timingSafeEqual(expectedBuffer, tokenBuffer);
}

export async function getOnlineBookingUrl() {
  const token = onlineBookingToken(await getOnlineBookingLinkVersion());
  return token ? `${config.siteUrl}/online-booking/${token}` : null;
}
