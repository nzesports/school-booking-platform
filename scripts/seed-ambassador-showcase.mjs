// Adds a complete, idempotent ambassador-portal showcase on top of the base
// demo seed. All rows are tied to "Demo Showcase" schools or @demo.esf.nz
// accounts, so scripts/remove-demo-data.mjs removes them again.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEMO_AMBASSADOR_EMAIL = "aroha.ambassador@demo.esf.nz";
const SHOWCASE_MARKER = "AMBASSADOR_SHOWCASE";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim().replace(/^(\"|')(.*)\1$/, "$2")])
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function fail(step, error) {
  console.error(`FAILED at ${step}:`, error?.message ?? error);
  process.exit(1);
}

function daysFromNow(days, hour = 10, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function maybeSingle(step, query) {
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) fail(step, error);
  return data;
}

const profile = await maybeSingle(
  "finding the showcase ambassador account",
  admin.from("profiles").select("id").eq("email", DEMO_AMBASSADOR_EMAIL)
);

if (!profile) {
  fail(
    "finding the showcase ambassador account",
    `Run scripts/seed-demo-data.mjs before this script; ${DEMO_AMBASSADOR_EMAIL} does not exist.`
  );
}

const ambassador = await maybeSingle(
  "finding the showcase ambassador profile",
  admin.from("ambassador_profiles").select("id").eq("user_id", profile.id)
);

if (!ambassador) fail("finding the showcase ambassador profile", "Profile not found.");

const [{ data: regions, error: regionsError }, { data: presentations, error: presentationsError }] =
  await Promise.all([
    admin.from("regions").select("id, slug, name"),
    admin.from("presentation_types").select("id, slug, title")
  ]);

if (regionsError) fail("loading regions", regionsError);
if (presentationsError) fail("loading presentations", presentationsError);

const region = (slug) => regions.find((item) => item.slug === slug);
const presentation = (slug) => presentations.find((item) => item.slug === slug);

for (const slug of ["auckland-central", "south-auckland", "north-shore", "hamilton"]) {
  if (!region(slug)) fail("validating regions", `Missing region: ${slug}`);
}

for (const slug of ["digital-wellbeing", "understanding-esports", "esports-pathways"]) {
  if (!presentation(slug)) fail("validating presentation types", `Missing presentation: ${slug}`);
}

console.log("Completing the Aroha ambassador profile...");
{
  const { error: userError } = await admin
    .from("profiles")
    .update({ phone: "+64 21 555 0199", status: "active" })
    .eq("id", profile.id);
  if (userError) fail("updating the showcase user", userError);

  const { error: ambassadorError } = await admin
    .from("ambassador_profiles")
    .update({
      display_name: "Demo Aroha Ngata",
      contact_email: DEMO_AMBASSADOR_EMAIL,
      contact_phone: "+64 21 555 0199",
      bio: "A youth esports coach who helps students build healthier gaming habits and discover pathways into the industry.",
      experience:
        "Five years coaching school esports teams, facilitating assemblies, and running holiday programmes across Tāmaki Makaurau.",
      referred_by: "NZ Esports community network",
      bank_account_name: "Demo Aroha Ngata",
      bank_account_number: "12-3456-0789012-00",
      gst_number: "123-456-789",
      transport_access: true,
      open_to_travel: true,
      status: "approved",
      profile_details: {
        mailingAddress: "42 Demo Lane, Mount Eden, Auckland 1024",
        payoutEmail: DEMO_AMBASSADOR_EMAIL,
        payoutMethod: "Bank transfer",
        invoiceName: "Aroha Ngata",
        irdNumber: "123-456-789",
        billingNote: "Please include the school and presentation date on remittance advice.",
        bookingTypes: ["in_person", "school_talks", "workshops", "online"],
        preferredTimes: "Weekdays: 9:00 am–3:00 pm\nEvenings: Available for online whānau sessions",
        weeklyAvailability: {
          mon: "9am–3pm",
          tue: "9am–3pm",
          wed: "9am–5pm",
          thu: "9am–3pm",
          fri: "9am–1pm"
        },
        unavailableDates: ["18–20 September 2026"],
        availabilityNote: "Happy to travel with at least seven days' notice."
      }
    })
    .eq("id", ambassador.id);
  if (ambassadorError) fail("completing the ambassador profile", ambassadorError);
}

for (const slug of ["auckland-central", "south-auckland", "north-shore", "hamilton"]) {
  const regionId = region(slug).id;
  const existing = await maybeSingle(
    `checking travel region ${slug}`,
    admin
      .from("ambassador_travel_regions")
      .select("id")
      .eq("ambassador_profile_id", ambassador.id)
      .eq("region_id", regionId)
  );

  if (!existing) {
    const { error } = await admin.from("ambassador_travel_regions").insert({
      ambassador_profile_id: ambassador.id,
      region_id: regionId,
      notes: "Demo showcase travel preference"
    });
    if (error) fail(`adding travel region ${slug}`, error);
  }
}

async function ensureSchool({ key, name, regionSlug, city, contactName }) {
  let school = await maybeSingle(
    `finding ${name}`,
    admin.from("schools").select("id").eq("name", name)
  );

  const schoolPayload = {
    name,
    region_id: region(regionSlug).id,
    address: `${10 + key.length} Showcase Road`,
    suburb: city,
    city,
    postcode: "1010",
    roll_size: 680 + key.length * 25,
    notes: `${SHOWCASE_MARKER}:${key}`,
    status: "active"
  };

  if (school) {
    const { error } = await admin.from("schools").update(schoolPayload).eq("id", school.id);
    if (error) fail(`updating ${name}`, error);
  } else {
    const { data, error } = await admin.from("schools").insert(schoolPayload).select("id").single();
    if (error) fail(`creating ${name}`, error);
    school = data;
  }

  let contact = await maybeSingle(
    `finding the contact for ${name}`,
    admin.from("school_contacts").select("id").eq("school_id", school.id).eq("is_primary", true)
  );
  const contactPayload = {
    school_id: school.id,
    full_name: contactName,
    email: `showcase.${key}@demo.esf.nz`,
    phone: `+64 21 555 ${String(1000 + key.length * 17).slice(-4)}`,
    position: "Deputy Principal",
    is_primary: true,
    can_access_portal: false,
    marketing_consent: true
  };

  if (contact) {
    const { error } = await admin
      .from("school_contacts")
      .update(contactPayload)
      .eq("id", contact.id);
    if (error) fail(`updating the contact for ${name}`, error);
  } else {
    const { data, error } = await admin
      .from("school_contacts")
      .insert(contactPayload)
      .select("id")
      .single();
    if (error) fail(`creating the contact for ${name}`, error);
    contact = data;
  }

  return { schoolId: school.id, contactId: contact.id, contact: contactPayload };
}

async function ensureSession(spec) {
  const { schoolId, contactId, contact } = await ensureSchool(spec);
  const marker = `${SHOWCASE_MARKER}:${spec.key}`;
  let booking = await maybeSingle(
    `finding booking ${spec.key}`,
    admin.from("booking_requests").select("id").eq("internal_notes", marker)
  );

  const bookingPayload = {
    school_id: schoolId,
    primary_contact_id: contactId,
    region_id: region(spec.regionSlug).id,
    status: spec.bookingStatus ?? "confirmed",
    source: spec.sourced ? "ambassador_booked" : "public",
    submitted_by_user_id: spec.sourced ? profile.id : null,
    ambassador_outreach_by: spec.sourced ? ambassador.id : null,
    school_notes: spec.schoolNotes,
    internal_notes: marker,
    marketing_consent: true,
    created_at: daysFromNow(spec.createdDays, 9),
    updated_at: daysFromNow(spec.createdDays, 9)
  };

  if (booking) {
    const { error } = await admin
      .from("booking_requests")
      .update(bookingPayload)
      .eq("id", booking.id);
    if (error) fail(`updating booking ${spec.key}`, error);
  } else {
    const { data, error } = await admin
      .from("booking_requests")
      .insert(bookingPayload)
      .select("id")
      .single();
    if (error) fail(`creating booking ${spec.key}`, error);
    booking = data;
  }

  let session = await maybeSingle(
    `finding session ${spec.key}`,
    admin.from("booking_sessions").select("id").eq("booking_request_id", booking.id)
  );
  const sessionPayload = {
    booking_request_id: booking.id,
    presentation_type_id: presentation(spec.presentationSlug).id,
    region_id: region(spec.regionSlug).id,
    school_id: schoolId,
    assigned_ambassador_id: spec.assigned ? ambassador.id : null,
    status: spec.sessionStatus,
    starts_at: daysFromNow(spec.startsDays, spec.hour, spec.minute ?? 0),
    ends_at: daysFromNow(spec.startsDays, spec.hour, (spec.minute ?? 0) + 10),
    year_levels: spec.yearLevels,
    expected_student_count: spec.expected,
    actual_student_count: spec.actual ?? null,
    location_address: `${10 + spec.key.length} Showcase Road, ${spec.city}`,
    internal_notes: marker,
    share_contact_with_ambassador: Boolean(spec.assigned),
    report_status: spec.reportStatus ?? "not_submitted",
    payment_status: spec.paymentStatus ?? "not_eligible"
  };

  if (session) {
    const { error } = await admin
      .from("booking_sessions")
      .update(sessionPayload)
      .eq("id", session.id);
    if (error) fail(`updating session ${spec.key}`, error);
  } else {
    const { data, error } = await admin
      .from("booking_sessions")
      .insert(sessionPayload)
      .select("id")
      .single();
    if (error) fail(`creating session ${spec.key}`, error);
    session = data;
  }

  if (spec.applicationStatus) {
    const applicationPayload = {
      booking_session_id: session.id,
      ambassador_profile_id: ambassador.id,
      status: spec.applicationStatus,
      message: spec.applicationMessage,
      applied_at: daysFromNow(spec.createdDays + 1, 12)
    };
    const existingApplication = await maybeSingle(
      `finding application ${spec.key}`,
      admin
        .from("booking_session_applications")
        .select("id")
        .eq("booking_session_id", session.id)
        .eq("ambassador_profile_id", ambassador.id)
    );
    const { error } = existingApplication
      ? await admin
          .from("booking_session_applications")
          .update(applicationPayload)
          .eq("id", existingApplication.id)
      : await admin.from("booking_session_applications").insert(applicationPayload);
    if (error) fail(`saving application ${spec.key}`, error);
  }

  if (spec.report) {
    const reportPayload = {
      booking_session_id: session.id,
      ambassador_profile_id: ambassador.id,
      presenter_name: "Demo Aroha Ngata",
      school_roll_size: 680 + spec.key.length * 25,
      primary_contact_name: contact.full_name,
      primary_contact_email: contact.email,
      delivered_at: daysFromNow(spec.startsDays, spec.hour, (spec.minute ?? 0) + 10),
      first_presentation_to_school: spec.report.firstPresentation,
      students_competed_in_esports: spec.report.studentsCompeted,
      attendee_count: spec.actual ?? spec.expected,
      year_levels: spec.yearLevels,
      age_groups: spec.yearLevels,
      parents_present: spec.report.parentsPresent,
      media_consent_confirmed: true,
      attendee_quotes: spec.report.quote,
      attendance_rating: spec.report.attendanceRating,
      student_response_rating: spec.report.studentRating,
      teacher_response_rating: spec.report.teacherRating,
      presentation_energy_rating: spec.report.energyRating,
      student_questions_themes: spec.report.questions,
      presentation_feedback: spec.report.feedback,
      additional_notes: spec.report.notes,
      submitted_at: daysFromNow(spec.startsDays, spec.hour + 2),
      reviewed_for_payment_at: daysFromNow(spec.startsDays + 1, 10),
      reviewed_for_payment_by: null
    };
    const existingReport = await maybeSingle(
      `finding report ${spec.key}`,
      admin
        .from("ambassador_reports")
        .select("id")
        .eq("booking_session_id", session.id)
        .eq("ambassador_profile_id", ambassador.id)
    );
    const { error } = existingReport
      ? await admin.from("ambassador_reports").update(reportPayload).eq("id", existingReport.id)
      : await admin.from("ambassador_reports").insert(reportPayload);
    if (error) fail(`saving report ${spec.key}`, error);
  }

  if (spec.payment) {
    const paymentPayload = {
      booking_session_id: session.id,
      ambassador_profile_id: ambassador.id,
      amount_cents: spec.payment.sourced ? 30000 : 25000,
      base_amount_cents: 25000,
      sourcing_bonus_cents: spec.payment.sourced ? 5000 : 0,
      currency: "NZD",
      status: spec.payment.status,
      eligibility_reason: spec.payment.sourced
        ? "Completed presentation plus ambassador-sourced school bonus"
        : "Completed presentation approved for payment",
      invoice_number: spec.payment.invoiceNumber,
      bank_account_name: "Demo Aroha Ngata",
      bank_account_number: "12-3456-0789012-00",
      gst_number: "123-456-789",
      invoice_generated_at: daysFromNow(spec.startsDays + 2, 10),
      sent_to_finance_at: spec.payment.sentToFinance
        ? daysFromNow(spec.startsDays + 3, 11)
        : null,
      sent_to_email: spec.payment.sentToFinance ? "finance@demo.esf.nz" : null,
      finance_email_status: spec.payment.sentToFinance ? "sent" : "failed",
      finance_email_attempts: 1,
      paid_at: spec.payment.status === "paid" ? daysFromNow(spec.startsDays + 8, 10) : null,
      created_at: daysFromNow(spec.startsDays + 1, 10)
    };
    const existingPayment = await maybeSingle(
      `finding payment ${spec.key}`,
      admin
        .from("payments")
        .select("id")
        .eq("booking_session_id", session.id)
        .eq("ambassador_profile_id", ambassador.id)
    );
    const { error } = existingPayment
      ? await admin.from("payments").update(paymentPayload).eq("id", existingPayment.id)
      : await admin.from("payments").insert(paymentPayload);
    if (error) fail(`saving payment ${spec.key}`, error);
  }

  if (spec.feedback) {
    const feedbackPayload = {
      presentation_type_id: presentation(spec.presentationSlug).id,
      school_id: schoolId,
      booking_session_id: session.id,
      quote: spec.feedback.quote,
      attribution: `${contact.full_name}, ${spec.name} — Demo feedback`,
      rating: spec.feedback.rating,
      details: {
        studentsCompeted: spec.report?.studentsCompeted ? "yes" : "no",
        attendeeFeedback: spec.feedback.quote,
        attendanceRating: spec.feedback.rating,
        studentResponseRating: spec.feedback.studentRating,
        contentRating: spec.feedback.contentRating,
        presenterEnergyRating: spec.feedback.energyRating,
        hadEsportsClub: spec.feedback.hadClub ? "yes" : "no",
        consideringClub: "yes",
        mailingListOptIn: "yes"
      },
      is_approved: true,
      is_public: false,
      created_at: daysFromNow(spec.startsDays + 1, 14)
    };
    const existingFeedback = await maybeSingle(
      `finding school feedback ${spec.key}`,
      admin.from("presentation_reviews").select("id").eq("booking_session_id", session.id)
    );
    const { error } = existingFeedback
      ? await admin
          .from("presentation_reviews")
          .update(feedbackPayload)
          .eq("id", existingFeedback.id)
      : await admin.from("presentation_reviews").insert(feedbackPayload);
    if (error) fail(`saving school feedback ${spec.key}`, error);
  }

  return session.id;
}

console.log("Creating open opportunities and ambassador applications...");
const openSessions = [
  {
    key: "open-central",
    name: "Demo Showcase Mount Albert Grammar",
    regionSlug: "auckland-central",
    city: "Auckland",
    contactName: "Demo Mereana King",
    presentationSlug: "digital-wellbeing",
    createdDays: -3,
    startsDays: 9,
    hour: 10,
    yearLevels: "Years 9 to 10",
    expected: 220,
    sessionStatus: "tentative",
    schoolNotes: "Open assembly opportunity with a large Year 9 and 10 audience."
  },
  {
    key: "applied-south",
    name: "Demo Showcase Manurewa Intermediate",
    regionSlug: "south-auckland",
    city: "Manurewa",
    contactName: "Demo Wiremu Taylor",
    presentationSlug: "understanding-esports",
    createdDays: -5,
    startsDays: 16,
    hour: 11,
    yearLevels: "Years 7 to 8",
    expected: 180,
    sessionStatus: "applied",
    applicationStatus: "applied",
    applicationMessage:
      "I already work with intermediate-aged esports teams and can tailor the examples for this group.",
    schoolNotes: "The school wants practical examples for setting up a safe esports club."
  },
  {
    key: "withdrawn-north",
    name: "Demo Showcase North Shore College",
    regionSlug: "north-shore",
    city: "North Shore",
    contactName: "Demo Charlotte Lee",
    presentationSlug: "esports-pathways",
    createdDays: -8,
    startsDays: 24,
    hour: 13,
    yearLevels: "Years 11 to 13",
    expected: 140,
    sessionStatus: "tentative",
    applicationStatus: "withdrawn",
    applicationMessage: "Previously applied, then withdrew because of a date conflict.",
    schoolNotes: "Careers-focused session for senior students considering tertiary study."
  },
  {
    key: "open-hamilton",
    name: "Demo Showcase Rototuna Junior High",
    regionSlug: "hamilton",
    city: "Hamilton",
    contactName: "Demo Hana Roberts",
    presentationSlug: "digital-wellbeing",
    createdDays: -2,
    startsDays: 31,
    hour: 9,
    minute: 30,
    yearLevels: "Years 7 to 10",
    expected: 300,
    sessionStatus: "tentative",
    schoolNotes: "Morning whole-school presentation; travel support is available."
  }
];

for (const spec of openSessions) await ensureSession(spec);

console.log("Creating completed presentations, school feedback, and invoice states...");
const completedSessions = [
  {
    key: "paid-sourced",
    name: "Demo Showcase Onehunga High School",
    regionSlug: "auckland-central",
    city: "Onehunga",
    contactName: "Demo Rachel Morgan",
    presentationSlug: "esports-pathways",
    createdDays: -75,
    startsDays: -60,
    hour: 10,
    yearLevels: "Years 10 to 13",
    expected: 210,
    actual: 228,
    assigned: true,
    sourced: true,
    sessionStatus: "completed",
    reportStatus: "submitted",
    paymentStatus: "paid",
    schoolNotes: "Ambassador-sourced booking showing the additional $50 sourcing bonus.",
    report: {
      firstPresentation: true,
      studentsCompeted: true,
      parentsPresent: false,
      quote: "I did not realise esports could lead to so many different jobs.",
      attendanceRating: 5,
      studentRating: 5,
      teacherRating: 5,
      energyRating: 5,
      questions: "Broadcasting, event production, coaching, and tertiary pathways.",
      feedback: "Students stayed behind to ask about volunteering at local events.",
      notes: "School sourced directly by Aroha; $50 sourcing bonus applies."
    },
    payment: {
      sourced: true,
      status: "paid",
      invoiceNumber: "DEMO-AROHA-001",
      sentToFinance: true
    },
    feedback: {
      quote: "Aroha made the pathways feel practical and achievable. The students were engaged from start to finish.",
      rating: 5,
      studentRating: 5,
      contentRating: 5,
      energyRating: 5,
      hadClub: true
    }
  },
  {
    key: "with-finance",
    name: "Demo Showcase Papatoetoe High School",
    regionSlug: "south-auckland",
    city: "Papatoetoe",
    contactName: "Demo Michael Singh",
    presentationSlug: "digital-wellbeing",
    createdDays: -58,
    startsDays: -45,
    hour: 13,
    yearLevels: "Years 9 to 11",
    expected: 260,
    actual: 251,
    assigned: true,
    sessionStatus: "completed",
    reportStatus: "submitted",
    paymentStatus: "pending",
    schoolNotes: "Completed session with an invoice currently with finance.",
    report: {
      firstPresentation: true,
      studentsCompeted: false,
      parentsPresent: false,
      quote: "The screen-time examples sounded exactly like our house.",
      attendanceRating: 5,
      studentRating: 4,
      teacherRating: 5,
      energyRating: 5,
      questions: "Sleep routines, online conflict, and talking with whānau.",
      feedback: "Pastoral staff requested the take-home resource after the session.",
      notes: "Invoice has been sent to the demo finance inbox."
    },
    payment: {
      status: "approved",
      invoiceNumber: "DEMO-AROHA-002",
      sentToFinance: true
    },
    feedback: {
      quote: "The content was practical, balanced, and never talked down to our students.",
      rating: 4.8,
      studentRating: 4.6,
      contentRating: 5,
      energyRating: 5,
      hadClub: false
    }
  },
  {
    key: "invoice-received",
    name: "Demo Showcase Takapuna Grammar",
    regionSlug: "north-shore",
    city: "Takapuna",
    contactName: "Demo Sophie Martin",
    presentationSlug: "understanding-esports",
    createdDays: -43,
    startsDays: -30,
    hour: 9,
    yearLevels: "Years 9 to 10",
    expected: 190,
    actual: 197,
    assigned: true,
    sessionStatus: "completed",
    reportStatus: "submitted",
    paymentStatus: "pending",
    schoolNotes: "Approved payment with a simulated finance delivery issue.",
    report: {
      firstPresentation: false,
      studentsCompeted: true,
      parentsPresent: true,
      quote: "Now I understand why structure matters in a team.",
      attendanceRating: 4,
      studentRating: 5,
      teacherRating: 4,
      energyRating: 4,
      questions: "Team roles, sportsmanship, and starting a lunchtime club.",
      feedback: "A strong mix of discussion and practical club examples.",
      notes: "Approved payment with a simulated finance email delivery issue."
    },
    payment: {
      status: "approved",
      invoiceNumber: "DEMO-AROHA-003",
      sentToFinance: false
    },
    feedback: {
      quote: "Aroha connected esports to teamwork in a way that resonated with students and staff.",
      rating: 4.5,
      studentRating: 5,
      contentRating: 4.5,
      energyRating: 4.5,
      hadClub: true
    }
  }
];

for (const spec of completedSessions) await ensureSession(spec);

console.log("Creating ambassador notifications...");
for (const notification of [
  {
    title: "Demo: new open booking in Auckland Central",
    body: "Mount Albert Grammar has a Digital Wellbeing session available to apply for.",
    notification_type: "booking_opportunity",
    related_url: "/ambassador/open-bookings"
  },
  {
    title: "Demo: invoice submitted to finance",
    body: "Invoice DEMO-AROHA-002 is now with the finance team.",
    notification_type: "payment_approved",
    related_url: "/ambassador/earnings"
  },
  {
    title: "Demo: post-session report reminder",
    body: "Your Hamilton West School report is ready to complete.",
    notification_type: "report_reminder",
    related_url: "/ambassador/completed"
  }
]) {
  const existing = await maybeSingle(
    `finding notification ${notification.title}`,
    admin
      .from("notifications")
      .select("id")
      .eq("user_id", profile.id)
      .eq("title", notification.title)
  );
  if (!existing) {
    const { error } = await admin.from("notifications").insert({
      user_id: profile.id,
      ...notification
    });
    if (error) fail(`creating notification ${notification.title}`, error);
  }
}

console.log("");
console.log("Ambassador showcase data is ready.");
console.log(`  Login:    ${DEMO_AMBASSADOR_EMAIL}`);
console.log("  Password: DemoPass123!");
console.log("  Open bookings: 4 showcase opportunities (open, applied, and withdrawn examples)");
console.log("  Completed: 3 showcase sessions with reports and linked school feedback");
console.log("  Earnings: received, approved, finance retry, paid, and $50 sourcing bonus");
console.log("  Profile: completed personal, payment, tax, travel, and availability details");
console.log("");
console.log("Remove all demo records with: npm run local:demo:remove");
