import { NextResponse } from "next/server";

import { getAuthenticatedPortalUser } from "@/lib/services/auth";
import { getBookingContactDefaults } from "@/lib/services/bookings";

export async function GET() {
  const user = await getAuthenticatedPortalUser();

  if (!user || user.role !== "school") {
    return NextResponse.json({ defaults: null }, { headers: { "Cache-Control": "no-store" } });
  }

  const defaults = await getBookingContactDefaults(user.id);
  return NextResponse.json({ defaults }, { headers: { "Cache-Control": "no-store" } });
}
