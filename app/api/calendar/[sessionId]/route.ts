import { bookingCalendarDescription, buildIcsContent } from "@/lib/services/calendar-links";
import { config } from "@/lib/env";
import { relationOne } from "@/lib/supabase/relation";
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
    .select("starts_at, ends_at, status, location_address, year_levels, expected_student_count, booking_requests(reference_code), ambassador_profiles(display_name, profiles!ambassador_profiles_user_id_fkey(full_name)), presentation_types(title), schools(name, city, address)")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session?.starts_at) {
    return new Response("Session not found.", { status: 404 });
  }

  const presentation = relationOne(session.presentation_types);
  const school = relationOne(session.schools);
  const title = presentation?.title ?? "NZ Esports school presentation";
  const location = [school?.name, session.location_address || school?.address, school?.city].filter(Boolean).join(", ");
  const startsAt = session.starts_at as string;
  const endsAt =
    (session.ends_at as string | null) ??
    new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();

  const ics = buildIcsContent({
    uid: `${sessionId}@book.nzesports.org.nz`,
    cancelled: ["cancelled", "declined"].includes(session.status as string),
    title: `${title} — NZ Esports presentation`,
    description: bookingCalendarDescription({
      presentationTitle: title,
      schoolName: school?.name || "School",
      ambassadorName: relationOne(relationOne(session.ambassador_profiles)?.profiles)?.full_name || relationOne(session.ambassador_profiles)?.display_name,
      referenceCode: relationOne(session.booking_requests)?.reference_code,
      yearLevels: session.year_levels,
      expectedStudentCount: session.expected_student_count,
      manageUrl: `${config.siteUrl}/manage-booking`
    }),
    location,
    startsAt,
    endsAt
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nz-esports-session.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer"
    }
  });
}
