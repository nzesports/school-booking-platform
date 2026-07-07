import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and the token/UUID-authenticated API routes — the
    // session refresh costs a Supabase Auth round-trip per matched request,
    // so images and public files must not pay it.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/cron|api/calendar|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff2?|ttf|otf|txt|xml|webmanifest)$).*)"
  ]
};
