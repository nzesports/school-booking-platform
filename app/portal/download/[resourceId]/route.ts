import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedPortalUser, portalPathForRole } from "@/lib/services/auth";
import { createSignedResourceUrl } from "@/lib/services/storage";
import { createAdminClient } from "@/lib/supabase/admin";

function inlineFilename(storagePath: string) {
  const fileName = storagePath.split("/").at(-1) ?? "resource.pdf";
  return encodeURIComponent(fileName);
}

async function streamPdfInline(request: NextRequest, signedUrl: string, storagePath: string) {
  const range = request.headers.get("range");
  const upstream = await fetch(signedUrl, {
    headers: range ? { Range: range } : undefined
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Preview unavailable." }, { status: 502 });
  }

  const headers = new Headers({
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": `inline; filename*=UTF-8''${inlineFilename(storagePath)}`,
    "Content-Type": "application/pdf",
    "X-Content-Type-Options": "nosniff"
  });

  for (const name of ["accept-ranges", "content-length", "content-range"]) {
    const value = upstream.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers
  });
}

function canAccessResource(
  user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedPortalUser>>>,
  audiences: string[],
  sharingScope: string
) {
  if (user.role === "super_admin" || user.role === "staff") {
    return true;
  }

  if (user.role === "ambassador") {
    return (
      user.ambassadorStatus === "approved" &&
      (audiences.includes("ambassador") || audiences.includes("public"))
    );
  }

  return audiences.includes("school") && sharingScope === "public";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const forceDownload = request.nextUrl.searchParams.get("download") === "1";
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
    .select("*")
    .eq("id", resourceId)
    .maybeSingle();

  if (!resource) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }

  const audiences =
    Array.isArray(resource.audiences) && resource.audiences.length > 0
      ? (resource.audiences as string[])
      : [];

  const isStaffLike = user.role === "super_admin" || user.role === "staff";

  if (
    !canAccessResource(user, audiences, resource.sharing_scope as string) ||
    (!isStaffLike && (!resource.is_active || !resource.is_current))
  ) {
    return NextResponse.redirect(new URL(portalPathForRole(user.role), request.url));
  }

  if (user.role === "ambassador" && resource.category === "presentation_material") {
    const { data: ambassadorProfile } = await admin
      .from("ambassador_profiles")
      .select("profile_details")
      .eq("user_id", user.id)
      .maybeSingle();
    const details = ambassadorProfile?.profile_details;
    const hasAcceptedMaterialsAgreement =
      details !== null &&
      typeof details === "object" &&
      Boolean((details as Record<string, unknown>).materialsConsentAcceptedAt);

    if (!hasAcceptedMaterialsAgreement) {
      return NextResponse.redirect(
        new URL("/ambassador/materials?error=materials-consent-required", request.url)
      );
    }
  }

  const storagePath = resource.storage_path as string | null;

  if (!storagePath && resource.public_url) {
    return NextResponse.redirect(resource.public_url as string);
  }

  const signedUrl = await createSignedResourceUrl(
    storagePath,
    forceDownload ? 5 * 60 : 15 * 60,
    forceDownload
  );

  if (!signedUrl) {
    return NextResponse.json({ error: "Download unavailable." }, { status: 404 });
  }

  if (!forceDownload && storagePath && /\.(?:doc|docx|ppt|pptx)$/i.test(storagePath)) {
    const officePreviewUrl = new URL("https://view.officeapps.live.com/op/view.aspx");
    officePreviewUrl.searchParams.set("src", signedUrl);
    return NextResponse.redirect(officePreviewUrl);
  }

  if (!forceDownload && storagePath && /\.pdf$/i.test(storagePath)) {
    return streamPdfInline(request, signedUrl, storagePath);
  }

  return NextResponse.redirect(signedUrl);
}
