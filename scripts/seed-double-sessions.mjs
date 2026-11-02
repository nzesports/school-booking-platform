// Adds double-session bookings for the demo ambassador, each with its report
// submitted through submit_ambassador_report_group exactly as the portal does
// (base amount only; staff pick the add-on at approval, which the tier
// preselects), so the Payments tab has one payment per case to approve:
//   less than 2 hours (30 min gap) -> +$50
//   2 to 4 hours apart            -> +$100
//   sourced, back to back         -> $300 sourced rate + $50
//   4 hr 30 min apart             -> staff custom review
// Local test database only. Idempotent: a booking that already has its report
// is left alone. Schools are "Demo %" and contacts @demo.esf.nz, so
// scripts/remove-demo-data.mjs removes them again.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEMO_AMBASSADOR_EMAIL = "aroha.ambassador@demo.esf.nz";
const MARKER = "DOUBLE_SESSION_DEMO";
// Same rates the portal uses (payment settings).
const DELIVERY_CENTS = 25000;
const SOURCING_BONUS_CENTS = 5000;
const ELIGIBLE_THRESHOLD = 100;

const env = Object.fromEntries(
  readFileSync(process.env.SEED_ENV_FILE ?? ".env.development.local", "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim().replace(/^("|')(.*)\1$/, "$2")])
);

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  console.error("Refusing to seed: the Supabase URL is not a local address.");
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function fail(step, error) {
  console.error(`FAILED at ${step}:`, error?.message ?? error);
  process.exit(1);
}

async function maybeSingle(step, query) {
  const { data, error } = await query.maybeSingle();
  if (error) fail(step, error);
  return data;
}

function daysAgoAt(days, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

const profile = await maybeSingle(
  "finding the demo ambassador",
  admin.from("profiles").select("id").eq("email", DEMO_AMBASSADOR_EMAIL)
);
if (!profile) fail("finding the demo ambassador", "run the demo seed first (npm run local:seed)");
const ambassador = await maybeSingle(
  "finding the demo ambassador profile",
  admin.from("ambassador_profiles").select("id").eq("user_id", profile.id)
);
if (!ambassador) fail("finding the demo ambassador profile", "no ambassador profile");

const [{ data: regions, error: regionsError }, { data: presentations, error: presentationsError }] =
  await Promise.all([
    admin.from("regions").select("id, slug"),
    admin.from("presentation_types").select("id, slug")
  ]);
if (regionsError) fail("loading regions", regionsError);
if (presentationsError) fail("loading presentations", presentationsError);
const regionId = (slug) => regions.find((item) => item.slug === slug)?.id ?? regions[0].id;
const presentationId = (slug) => presentations.find((item) => item.slug === slug)?.id ?? presentations[0].id;

async function ensureSchool(spec) {
  let school = await maybeSingle(
    `finding ${spec.name}`,
    admin.from("schools").select("id").eq("name", spec.name)
  );

  if (!school) {
    const { data, error } = await admin
      .from("schools")
      .insert({
        name: spec.name,
        region_id: regionId(spec.regionSlug),
        address: "20 Double Session Road",
        suburb: spec.city,
        city: spec.city,
        postcode: "1010",
        roll_size: 900,
        notes: `${MARKER}:${spec.key}`,
        status: "active"
      })
      .select("id")
      .single();
    if (error) fail(`creating ${spec.name}`, error);
    school = data;
  }

  let contact = await maybeSingle(
    `finding the contact for ${spec.name}`,
    admin.from("school_contacts").select("id, full_name, email").eq("school_id", school.id).eq("is_primary", true)
  );

  if (!contact) {
    const { data, error } = await admin
      .from("school_contacts")
      .insert({
        school_id: school.id,
        full_name: spec.contactName,
        email: `double.${spec.key}@demo.esf.nz`,
        phone: "+64 21 555 0199",
        position: "Deputy Principal",
        is_primary: true,
        can_access_portal: false,
        marketing_consent: true
      })
      .select("id, full_name, email")
      .single();
    if (error) fail(`creating the contact for ${spec.name}`, error);
    contact = data;
  }

  return { schoolId: school.id, contact };
}

async function ensureDoubleSession(spec) {
  const marker = `${MARKER}:${spec.key}`;
  const existing = await maybeSingle(
    `finding booking ${spec.key}`,
    admin.from("booking_requests").select("id").eq("internal_notes", marker)
  );

  if (existing) {
    console.log(`  ${spec.label}: already there`);
    return;
  }

  const { schoolId, contact } = await ensureSchool(spec);
  const { data: booking, error: bookingError } = await admin
    .from("booking_requests")
    .insert({
      school_id: schoolId,
      primary_contact_id: contact.id,
      region_id: regionId(spec.regionSlug),
      status: "confirmed",
      source: spec.sourced ? "ambassador_booked" : "public",
      submitted_by_user_id: spec.sourced ? profile.id : null,
      ambassador_outreach_by: spec.sourced ? ambassador.id : null,
      school_notes: `Test double session: ${spec.label}.`,
      internal_notes: marker,
      marketing_consent: true,
      created_at: daysAgoAt(spec.daysAgo + 14, 9).toISOString()
    })
    .select("id")
    .single();
  if (bookingError) fail(`creating booking ${spec.key}`, bookingError);

  const firstStart = daysAgoAt(spec.daysAgo, 9);
  const firstEnd = new Date(firstStart.getTime() + 60 * 60_000);
  const secondStart = new Date(firstEnd.getTime() + spec.gapMinutes * 60_000);
  const secondEnd = new Date(secondStart.getTime() + 60 * 60_000);
  const sessionRows = [
    [firstStart, firstEnd, "Years 7 to 8"],
    [secondStart, secondEnd, "Years 9 to 10"]
  ].map(([startsAt, endsAt, yearLevels]) => ({
    booking_request_id: booking.id,
    presentation_type_id: presentationId(spec.presentationSlug),
    region_id: regionId(spec.regionSlug),
    school_id: schoolId,
    assigned_ambassador_id: ambassador.id,
    status: "confirmed",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    year_levels: yearLevels,
    expected_student_count: 120,
    location_address: `20 Double Session Road, ${spec.city}`,
    internal_notes: marker,
    share_contact_with_ambassador: true,
    report_status: "not_submitted",
    payment_status: "not_eligible"
  }));
  const { data: sessions, error: sessionsError } = await admin
    .from("booking_sessions")
    .insert(sessionRows)
    .select("id, starts_at")
    .order("starts_at", { ascending: true });
  if (sessionsError) fail(`creating sessions ${spec.key}`, sessionsError);

  const { data: rows, error: submitError } = await admin.rpc("submit_ambassador_report_group", {
    p_session_id: sessions[0].id,
    p_ambassador_profile_id: ambassador.id,
    p_actor_id: profile.id,
    p_report: {
      presenter_name: "Demo Aroha Ngata",
      school_roll_size: 900,
      primary_contact_name: contact.full_name,
      primary_contact_email: contact.email,
      delivered_at: firstStart.toISOString(),
      students_competed_in_esports: false,
      attendee_count: 240,
      year_levels: "Years 7 to 10",
      age_groups: "Years 7 to 10",
      parents_present: false,
      attendee_quotes: "Two great sessions; the seniors asked even more questions than the juniors.",
      attendance_rating: 5,
      student_response_rating: 5,
      teacher_response_rating: 4,
      presentation_energy_rating: 5,
      presentation_feedback: `Test double session (${spec.label}).`,
      student_questions_themes: "Screen time, careers in esports, staying safe online.",
      additional_notes: `Test data: ${spec.label}.`,
      media_consent_confirmed: true
    },
    p_delivery_cents: DELIVERY_CENTS,
    p_sourcing_bonus_cents: SOURCING_BONUS_CENTS,
    p_short_pair_cents: 0,
    p_extended_pair_cents: 0,
    p_eligible_threshold: ELIGIBLE_THRESHOLD,
    p_is_sourced: Boolean(spec.sourced)
  });
  if (submitError) fail(`submitting report ${spec.key}`, submitError);
  const result = Array.isArray(rows) ? rows[0] : rows;

  if (!result?.payment_id) {
    fail(`submitting report ${spec.key}`, `outcome ${result?.outcome ?? "unknown"}`);
  }

  console.log(
    `  ${spec.label}: $${result.amount_cents / 100} (${result.payment_tier}${result.review_required ? ", needs custom review" : ""})`
  );
}

console.log("Creating double-session reports for the Payments tab...");
for (const spec of [
  {
    key: "within-hour",
    label: "less than 2 hours (30 min gap)",
    name: "Demo Double Session Mt Roskill Grammar",
    contactName: "Demo Priya Shah",
    regionSlug: "auckland-central",
    city: "Mt Roskill",
    presentationSlug: "digital-wellbeing",
    daysAgo: 2,
    gapMinutes: 30
  },
  {
    key: "two-to-four-hours",
    label: "2 to 4 hours apart (2 hr 30 min gap)",
    name: "Demo Double Session Manurewa High School",
    contactName: "Demo Tama Rewi",
    regionSlug: "south-auckland",
    city: "Manurewa",
    presentationSlug: "esports-pathways",
    daysAgo: 3,
    gapMinutes: 150
  },
  {
    key: "sourced-back-to-back",
    label: "sourced, back to back",
    name: "Demo Double Session Takapuna Grammar",
    contactName: "Demo Grace Liu",
    regionSlug: "north-shore",
    city: "Takapuna",
    presentationSlug: "understanding-esports",
    daysAgo: 4,
    gapMinutes: 0,
    sourced: true
  },
  {
    key: "custom-review",
    label: "4 hr 30 min apart (custom review)",
    name: "Demo Double Session Hamilton Girls High",
    contactName: "Demo Anna Brooks",
    regionSlug: "hamilton",
    city: "Hamilton",
    presentationSlug: "digital-wellbeing",
    daysAgo: 5,
    gapMinutes: 270
  }
]) {
  await ensureDoubleSession(spec);
}

console.log("Double-session test data is ready (Payments → Awaiting report approval).");
