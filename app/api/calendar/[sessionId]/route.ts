import { buildIcsContent } from "@/lib/services/calendar-links";
import { config } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Public .ics download for the "Apple / .ics" add-to-calendar link in
// booking emails. Knowing the session UUID is the capability — same model as
// the public /feedback/[sessionId] page. Email clients need a hosted https
// file; data: URIs get stripped.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const admin = createAdminClient();

  if (!admin) {
    return new Response("Calendar downloads are not available.", { status: 503 });
  }

  const { data: session } = await admin
    .from("booking_sessions")
    .select("starts_at, ends_at, presentation_types(title), schools(name, city)")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session?.starts_at) {
    return new Response("Session not found.", { status: 404 });
  }

  const presentation = session.presentation_types as { title?: string } | null;
  const school = session.schools as { name?: string; city?: string } | null;
  const title = presentation?.title ?? "NZ Esports school presentation";
  const location = [school?.name, school?.city].filter(Boolean).join(", ");
  const startsAt = session.starts_at as string;
  const endsAt =
    (session.ends_at as string | null) ??
    new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();

  const ics = buildIcsContent({
    title: `${title} — NZ Esports presentation`,
    description: `NZ Esports school presentation${school?.name ? ` at ${school.name}` : ""}. Manage your booking: ${config.siteUrl}/school/bookings`,
    location,
    startsAt,
    endsAt
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nz-esports-session.ics"',
      "Cache-Control": "private, max-age=0"
    }
  });
}
