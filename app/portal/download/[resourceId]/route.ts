import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedPortalUser, portalPathForRole } from "@/lib/services/auth";
import { createSignedResourceUrl } from "@/lib/services/storage";
import { createAdminClient } from "@/lib/supabase/admin";

function canAccessResource(
  user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedPortalUser>>>,
  audiences: string[]
) {
  if (user.role === "super_admin" || user.role === "staff") {
    return true;
  }

  if (user.role === "ambassador") {
    return user.ambassadorStatus === "approved" && audiences.includes("ambassador");
  }

  return audiences.includes("school");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const user = await getAuthenticatedPortalUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?error=auth-required", request.url));
  }

  if (user.status !== "active") {
    return NextResponse.redirect(new URL("/login?error=account-inactive", request.url));
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase admin access is unavailable." }, { status: 503 });
  }

  const { resourceId } = await params;
  const { data: resource } = await admin
    .from("presentation_resources")
    .select("storage_path, public_url, audiences")
    .eq("id", resourceId)
    .eq("is_active", true)
    .maybeSingle();

  if (!resource) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const audiences =
    Array.isArray(resource.audiences) && resource.audiences.length > 0
      ? (resource.audiences as string[])
      : [];

  if (!canAccessResource(user, audiences)) {
    return NextResponse.redirect(new URL(portalPathForRole(user.role), request.url));
  }

  if (resource.public_url) {
    return NextResponse.redirect(resource.public_url as string);
  }

  const signedUrl = await createSignedResourceUrl(resource.storage_path as string | null, 5 * 60);

  if (!signedUrl) {
    return NextResponse.json({ error: "Download unavailable." }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl);
}
