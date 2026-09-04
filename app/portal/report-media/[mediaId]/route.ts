import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedPortalUser } from "@/lib/services/auth";
import { createSignedReportMediaUrl } from "@/lib/services/storage";
import { createAdminClient } from "@/lib/supabase/admin";

const SERVED_MEDIA_TYPES = new Set(["document", "image", "video"]);

const CONTENT_TYPE_BY_EXTENSION = new Map([
  ["pdf", "application/pdf"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["mp4", "video/mp4"],
  ["mov", "video/quicktime"],
  ["webm", "video/webm"]
]);

function encodedFilename(title: string | null, sourcePath: string) {
  const fallback = sourcePath.split("/").at(-1) || "report-media";
  return encodeURIComponent(title || decodeURIComponent(fallback));
}

function contentTypeFor(sourcePath: string, upstreamType: string | null) {
  if (upstreamType && upstreamType !== "application/octet-stream") {
    return upstreamType;
  }

  const extension = sourcePath.split("?")[0].split(".").at(-1)?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION.get(extension) ?? "application/octet-stream";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const user = await getAuthenticatedPortalUser();

  if (!user || user.status !== "active") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Media preview is unavailable." }, { status: 503 });
  }

  const { mediaId } = await params;
  const { data: media } = await admin
    .from("media_library")
    .select("id, report_id, storage_path, public_url, media_type, title")
    .eq("id", mediaId)
    .maybeSingle();

  if (!media || !SERVED_MEDIA_TYPES.has(String(media.media_type))) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  if (user.role === "ambassador") {
    const { data: report } = await admin
      .from("ambassador_reports")
      .select("ambassador_profile_id")
      .eq("id", media.report_id)
      .maybeSingle();
    const { data: ambassador } = report?.ambassador_profile_id
      ? await admin
          .from("ambassador_profiles")
          .select("user_id")
          .eq("id", report.ambassador_profile_id)
          .maybeSingle()
      : { data: null };

    if (ambassador?.user_id !== user.id) {
      return NextResponse.json({ error: "You cannot access this media." }, { status: 403 });
    }
  } else if (user.role !== "staff" && user.role !== "super_admin") {
    return NextResponse.json({ error: "You cannot access this media." }, { status: 403 });
  }

  // Rows written since report media moved to the private `report-media`
  // bucket keep an app-relative public_url (/portal/report-media/<id>) and a
  // storage_path within that bucket; legacy rows carry an absolute public URL
  // on the public-assets bucket. Serve both.
  const storedPublicUrl = String(media.public_url ?? "");
  const isLegacyPublicUrl = /^https?:\/\//.test(storedPublicUrl);
  let fetchUrl: string;
  let filenameSource: string;

  if (!isLegacyPublicUrl) {
    const signedUrl = await createSignedReportMediaUrl(media.storage_path as string | null);

    if (!signedUrl) {
      return NextResponse.json({ error: "Media preview is unavailable." }, { status: 404 });
    }

    fetchUrl = signedUrl;
    filenameSource = String(media.storage_path);
  } else {
    let sourceUrl: URL;

    try {
      sourceUrl = new URL(storedPublicUrl);
    } catch {
      return NextResponse.json({ error: "Media URL is invalid." }, { status: 400 });
    }

    if (!["http:", "https:"].includes(sourceUrl.protocol)) {
      return NextResponse.json({ error: "Media URL is invalid." }, { status: 400 });
    }

    fetchUrl = sourceUrl.toString();
    filenameSource = sourceUrl.pathname;
  }

  const range = request.headers.get("range");
  const upstream = await fetch(fetchUrl, {
    headers: range ? { Range: range } : undefined
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Media preview is unavailable." }, { status: 502 });
  }

  const headers = new Headers({
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": `inline; filename*=UTF-8''${encodedFilename(media.title, filenameSource)}`,
    "Content-Type": contentTypeFor(filenameSource, upstream.headers.get("content-type")),
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
