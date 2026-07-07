// Seeds clearly-marked demo data into Supabase so every portal page has
// content to look at. Everything it creates is tagged "Demo" (school names)
// or uses the @demo.esf.nz email domain, so scripts/remove-demo-data.mjs can
// wipe it all again.
//
// Run from the project root:  node scripts/seed-demo-data.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAIL_DOMAIN = "demo.esf.nz";
const DEMO_PASSWORD = "DemoPass123!";

const envText = readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

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

// ---------------------------------------------------------------- guards
const { data: existingDemo } = await admin
  .from("schools")
  .select("id")
  .ilike("name", "Demo %")
  .limit(1);

if (existingDemo?.length) {
  console.log("Demo data already exists. Run `node scripts/remove-demo-data.mjs` first.");
  process.exit(0);
}

// ---------------------------------------------------------------- lookups
const { data: regions } = await admin.from("regions").select("id, slug");
const regionId = (slug) => regions?.find((region) => region.slug === slug)?.id ?? null;

const { data: presentations } = await admin.from("presentation_types").select("id, slug");
const presentationId = (slug) =>
  presentations?.find((presentation) => presentation.slug === slug)?.id ?? null;

const { data: superAdmins } = await admin
  .from("profiles")
  .select("id")
  .eq("role", "super_admin")
  .limit(1);
const approverId = superAdmins?.[0]?.id ?? null;

const { data: staffProfiles } = await admin
  .from("profiles")
  .select("id")
  .in("role", ["staff", "super_admin"]);

// ---------------------------------------------------------------- auth users
async function createDemoUser(email, metadata) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: metadata
  });

  if (!error) {
    return data.user.id;
  }

  // Re-runs after a partial seed: reuse the existing account.
  if (/already/i.test(error.message)) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (profile) {
      return profile.id;
    }
  }

  fail(`creating auth user ${email}`, error);
}

console.log("Creating demo portal accounts...");
const arohaId = await createDemoUser(`aroha.ambassador@${DEMO_EMAIL_DOMAIN}`, {
  role: "ambassador",
  full_name: "Demo Aroha Ngata",
  region_slug: "auckland-central",
  experience:
    "Five years coaching school esports teams and running holiday programmes across Tāmaki Makaurau.",
  open_to_travel: true
});
const marcusId = await createDemoUser(`marcus.ambassador@${DEMO_EMAIL_DOMAIN}`, {
  role: "ambassador",
  full_name: "Demo Marcus Chen",
  region_slug: "wellington",
  experience:
    "Former secondary teacher and shoutcaster. Has presented digital wellbeing sessions to assemblies of 400+.",
  open_to_travel: false
});
const sophieId = await createDemoUser(`sophie.ambassador@${DEMO_EMAIL_DOMAIN}`, {
  role: "ambassador",
  full_name: "Demo Sophie Williams",
  region_slug: "christchurch",
  experience:
    "Youth worker and community esports organiser looking to bring structured gaming kōrero into schools.",
  open_to_travel: true
});
// Create the portal school + contact first so the auth trigger takes its
// simple "link existing contact" path instead of creating the school itself.
const { data: rangitotoSchool, error: rangitotoError } = await admin
  .from("schools")
  .insert({
    name: "Demo Rangitoto College",
    region_id: regionId("north-shore"),
    city: "Auckland",
    address: "564 East Coast Road",
    suburb: "Mairangi Bay",
    postcode: "0630",
    roll_size: 3200,
    status: "active"
  })
  .select("id")
  .single();
if (rangitotoError) fail("creating Demo Rangitoto College", rangitotoError);

const { error: rangitotoContactError } = await admin.from("school_contacts").insert({
  school_id: rangitotoSchool.id,
  full_name: "Demo Jordan Smith",
  email: `jordan.school@${DEMO_EMAIL_DOMAIN}`,
  phone: "+64 21 555 0100",
  position: "HOD Digital Technologies",
  is_primary: true,
  can_access_portal: true,
  marketing_consent: true
});
if (rangitotoContactError) fail("creating Demo Rangitoto contact", rangitotoContactError);

// The live handle_new_auth_user trigger currently errors on its school
// branch (see supabase/migrations/0010_fix_school_signup_trigger.sql), so we
// create the account through the working ambassador branch and convert it.
const schoolUserId = await createDemoUser(`jordan.school@${DEMO_EMAIL_DOMAIN}`, {
  role: "ambassador",
  full_name: "Demo Jordan Smith",
  phone: "+64 21 555 0100",
  region_slug: "north-shore"
});

{
  const { data: strayAmbassador } = await admin
    .from("ambassador_profiles")
    .select("id")
    .eq("user_id", schoolUserId)
    .maybeSingle();

  if (strayAmbassador) {
    await admin
      .from("notifications")
      .delete()
      .eq("related_url", `/staff/ambassadors/${strayAmbassador.id}`);
    await admin.from("ambassador_travel_regions").delete().eq("ambassador_profile_id", strayAmbassador.id);
    const { error } = await admin.from("ambassador_profiles").delete().eq("id", strayAmbassador.id);
    if (error) fail("removing stray ambassador profile for school user", error);
  }

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "school" })
    .eq("id", schoolUserId);
  if (roleError) fail("setting school user role", roleError);

  const { data: jordanContact } = await admin
    .from("school_contacts")
    .select("id")
    .ilike("email", `jordan.school@${DEMO_EMAIL_DOMAIN}`)
    .maybeSingle();

  if (jordanContact) {
    const { error } = await admin.from("school_contact_users").insert({
      school_contact_id: jordanContact.id,
      user_id: schoolUserId
    });
    if (error && !/duplicate/i.test(error.message)) {
      fail("linking school user to contact", error);
    }
  }
}

// Approve two ambassadors; leave Sophie in the review queue.
async function ambassadorProfileId(userId) {
  const { data, error } = await admin
    .from("ambassador_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) fail(`finding ambassador profile for ${userId}`, error);
  return data.id;
}

const arohaProfileId = await ambassadorProfileId(arohaId);
const marcusProfileId = await ambassadorProfileId(marcusId);
await ambassadorProfileId(sophieId); // exists; stays "applied"

for (const id of [arohaProfileId, marcusProfileId]) {
  const { error } = await admin
    .from("ambassador_profiles")
    .update({ status: "approved", approved_at: daysFromNow(-30), approved_by: approverId })
    .eq("id", id);
  if (error) fail("approving demo ambassador", error);
}

// ---------------------------------------------------------------- schools
console.log("Creating demo schools and contacts...");
const schoolSeed = [
  {
    name: "Demo Wellington High School",
    region: "wellington",
    city: "Wellington",
    roll: 1250,
    address: "249 Taranaki Street",
    suburb: "Mount Cook",
    postcode: "6011"
  },
  {
    name: "Demo Christchurch Boys' High",
    region: "christchurch",
    city: "Christchurch",
    roll: 1400,
    address: "77 Straven Road",
    suburb: "Riccarton",
    postcode: "8014"
  },
  {
    name: "Demo Hamilton West School",
    region: "hamilton",
    city: "Hamilton",
    roll: 620,
    address: "12 Whatawhata Road",
    suburb: "Dinsdale",
    postcode: "3204"
  },
  {
    name: "Demo Tauranga Intermediate",
    region: "tauranga",
    city: "Tauranga",
    roll: 780,
    address: "8 Fourteenth Avenue",
    suburb: "Tauranga South",
    postcode: "3112"
  }
];

const schoolIds = {};

for (const school of schoolSeed) {
  const { data, error } = await admin
    .from("schools")
    .insert({
      name: school.name,
      region_id: regionId(school.region),
      city: school.city,
      address: school.address,
      suburb: school.suburb,
      postcode: school.postcode,
      roll_size: school.roll,
      status: "active"
    })
    .select("id")
    .single();
  if (error) fail(`creating ${school.name}`, error);
  schoolIds[school.name] = data.id;
}

schoolIds["Demo Rangitoto College"] = rangitotoSchool.id;

const contactIds = {};
const contactSeed = [
  { school: "Demo Wellington High School", name: "Demo Priya Patel", phone: "+64 21 555 0101" },
  { school: "Demo Christchurch Boys' High", name: "Demo Tom Baker", phone: "+64 21 555 0102" },
  { school: "Demo Hamilton West School", name: "Demo Hine Walker", phone: "+64 21 555 0103" },
  { school: "Demo Tauranga Intermediate", name: "Demo Sam Green", phone: "+64 21 555 0104" }
];

for (const contact of contactSeed) {
  const emailName = contact.name.toLowerCase().replace(/[^a-z]+/g, ".");
  const { data, error } = await admin
    .from("school_contacts")
    .insert({
      school_id: schoolIds[contact.school],
      full_name: contact.name,
      email: `${emailName}@${DEMO_EMAIL_DOMAIN}`,
      phone: contact.phone,
      position: "Deputy Principal",
      is_primary: true,
      marketing_consent: true
    })
    .select("id")
    .single();
  if (error) fail(`creating contact for ${contact.school}`, error);
  contactIds[contact.school] = data.id;
}

// ---------------------------------------------------------------- bookings
console.log("Creating demo bookings and sessions...");

async function createBooking({ school, region, status, createdDaysAgo, notes }) {
  const { data, error } = await admin
    .from("booking_requests")
    .insert({
      school_id: schoolIds[school],
      primary_contact_id: contactIds[school] ?? null,
      region_id: regionId(region),
      status,
      source: "public",
      school_notes: notes ?? null,
      marketing_consent: true,
      created_at: daysFromNow(-createdDaysAgo),
      updated_at: daysFromNow(-createdDaysAgo)
    })
    .select("id")
    .single();
  if (error) fail(`creating booking for ${school}`, error);
  return data.id;
}

async function createSession(bookingId, session) {
  const { data, error } = await admin
    .from("booking_sessions")
    .insert({
      booking_request_id: bookingId,
      presentation_type_id: presentationId(session.presentation),
      region_id: regionId(session.region),
      school_id: schoolIds[session.school],
      assigned_ambassador_id: session.ambassadorProfileId ?? null,
      status: session.status,
      starts_at: session.startsAt,
      ends_at: session.endsAt,
      year_levels: session.yearLevels,
      expected_student_count: session.expected,
      actual_student_count: session.actual ?? null,
      report_status: session.reportStatus ?? "not_submitted",
      payment_status: session.paymentStatus ?? "not_eligible",
      share_contact_with_ambassador: session.shareContact ?? Boolean(session.ambassadorProfileId)
    })
    .select("id")
    .single();
  if (error) fail("creating session", error);
  return data.id;
}

// 1. Completed session three weeks ago — reported and paid.
const booking1 = await createBooking({
  school: "Demo Wellington High School",
  region: "wellington",
  status: "confirmed",
  createdDaysAgo: 35,
  notes: "Assembly slot straight after morning karakia. AV support available."
});
const session1 = await createSession(booking1, {
  school: "Demo Wellington High School",
  region: "wellington",
  presentation: "esports-pathways",
  ambassadorProfileId: marcusProfileId,
  status: "completed",
  startsAt: daysFromNow(-21, 9, 0),
  endsAt: daysFromNow(-21, 9, 10),
  yearLevels: "Years 9 to 13",
  expected: 250,
  actual: 240,
  reportStatus: "submitted",
  paymentStatus: "paid"
});

// 2. Completed session two weeks ago — reported, payment pending invoice.
const booking2 = await createBooking({
  school: "Demo Rangitoto College",
  region: "north-shore",
  status: "confirmed",
  createdDaysAgo: 28,
  notes: "Two year groups combined in the auditorium."
});
const session2 = await createSession(booking2, {
  school: "Demo Rangitoto College",
  region: "north-shore",
  presentation: "digital-wellbeing",
  ambassadorProfileId: arohaProfileId,
  status: "completed",
  startsAt: daysFromNow(-14, 11, 30),
  endsAt: daysFromNow(-14, 11, 40),
  yearLevels: "Years 7 to 8",
  expected: 180,
  actual: 195,
  reportStatus: "submitted",
  paymentStatus: "pending"
});

// 3. Upcoming confirmed session with an assigned ambassador.
const booking3 = await createBooking({
  school: "Demo Christchurch Boys' High",
  region: "christchurch",
  status: "confirmed",
  createdDaysAgo: 10,
  notes: "Careers week feature slot."
});
await createSession(booking3, {
  school: "Demo Christchurch Boys' High",
  region: "christchurch",
  presentation: "careers",
  ambassadorProfileId: arohaProfileId,
  status: "confirmed",
  startsAt: daysFromNow(7, 13, 0),
  endsAt: daysFromNow(7, 13, 10),
  yearLevels: "Years 9 to 13",
  expected: 320
});

// 4. Upcoming session still needing an ambassador — with one application in.
const booking4 = await createBooking({
  school: "Demo Hamilton West School",
  region: "hamilton",
  status: "confirmed",
  createdDaysAgo: 6,
  notes: "Prefer a morning slot before interval."
});
const session4 = await createSession(booking4, {
  school: "Demo Hamilton West School",
  region: "hamilton",
  presentation: "understanding-esports",
  status: "ambassador_applied",
  startsAt: daysFromNow(14, 9, 30),
  endsAt: daysFromNow(14, 9, 40),
  yearLevels: "Years 7 to 8",
  expected: 140
});

{
  const { error } = await admin.from("booking_session_applications").insert({
    booking_session_id: session4,
    ambassador_profile_id: marcusProfileId,
    status: "applied",
    message: "Happy to travel down for this one — I have family in Kirikiriroa."
  });
  if (error) fail("creating session application", error);
}

// 5. Fresh tentative request from yesterday with two sessions.
const booking5 = await createBooking({
  school: "Demo Tauranga Intermediate",
  region: "tauranga",
  status: "tentative",
  createdDaysAgo: 1,
  notes: "Keen to combine wellbeing and pathways in one visit if possible."
});
await createSession(booking5, {
  school: "Demo Tauranga Intermediate",
  region: "tauranga",
  presentation: "digital-wellbeing",
  status: "ambassador_needed",
  startsAt: daysFromNow(21, 10, 0),
  endsAt: daysFromNow(21, 10, 10),
  yearLevels: "Years 7 to 8",
  expected: 160
});
await createSession(booking5, {
  school: "Demo Tauranga Intermediate",
  region: "tauranga",
  presentation: "esports-pathways",
  status: "ambassador_needed",
  startsAt: daysFromNow(21, 11, 0),
  endsAt: daysFromNow(21, 11, 10),
  yearLevels: "Years 7 to 8",
  expected: 160
});

// 6. Finished two days ago, assigned to Aroha, report still due — this is the
// session that demonstrates the report-submission flow end to end.
const booking6 = await createBooking({
  school: "Demo Hamilton West School",
  region: "hamilton",
  status: "confirmed",
  createdDaysAgo: 12,
  notes: "Full school assembly in the hall."
});
await createSession(booking6, {
  school: "Demo Hamilton West School",
  region: "hamilton",
  presentation: "understanding-esports",
  ambassadorProfileId: arohaProfileId,
  status: "completed",
  startsAt: daysFromNow(-2, 10, 0),
  endsAt: daysFromNow(-2, 10, 10),
  yearLevels: "Years 7 to 8",
  expected: 150,
  reportStatus: "not_submitted",
  shareContact: true
});

// ---------------------------------------------------------------- training
console.log("Creating demo training modules and progress...");
const trainingSeed = [
  {
    title: "Presenter Induction",
    description: "Core onboarding for every NZ Esports ambassador before their first visit.",
    sort_order: 1,
    lessons: [
      { title: "Welcome & code of conduct", lesson_type: "video", youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      { title: "Working safely in schools", lesson_type: "checklist" },
      { title: "Induction check", lesson_type: "quiz" }
    ]
  },
  {
    title: "Digital Wellbeing Delivery Pack",
    description: "Session structure, talking points, and FAQs for the Digital Wellbeing talk.",
    sort_order: 2,
    lessons: [
      { title: "Session walkthrough", lesson_type: "video" },
      { title: "Handling tricky questions", lesson_type: "checklist" }
    ]
  }
];

const lessonIdsByModule = {};

for (const trainingModule of trainingSeed) {
  const { data: moduleRow, error: moduleError } = await admin
    .from("training_modules")
    .insert({
      title: trainingModule.title,
      description: trainingModule.description,
      sort_order: trainingModule.sort_order,
      is_active: true,
      is_published: true,
      is_required: true
    })
    .select("id")
    .single();
  if (moduleError) fail(`creating training module ${trainingModule.title}`, moduleError);

  lessonIdsByModule[trainingModule.title] = [];

  for (const [index, lesson] of trainingModule.lessons.entries()) {
    const { data: lessonRow, error: lessonError } = await admin
      .from("training_lessons")
      .insert({
        training_module_id: moduleRow.id,
        title: lesson.title,
        lesson_type: lesson.lesson_type,
        youtube_url: lesson.youtube_url ?? null,
        sort_order: index + 1
      })
      .select("id")
      .single();
    if (lessonError) fail(`creating lesson ${lesson.title}`, lessonError);
    lessonIdsByModule[trainingModule.title].push(lessonRow.id);
  }
}

// Aroha has finished induction; Marcus is partway through it.
const progressRows = [
  ...lessonIdsByModule["Presenter Induction"].map((lessonId) => ({
    ambassador_profile_id: arohaProfileId,
    training_lesson_id: lessonId,
    status: "completed",
    completed_at: daysFromNow(-25)
  })),
  {
    ambassador_profile_id: arohaProfileId,
    training_lesson_id: lessonIdsByModule["Digital Wellbeing Delivery Pack"][0],
    status: "completed",
    completed_at: daysFromNow(-20)
  },
  {
    ambassador_profile_id: marcusProfileId,
    training_lesson_id: lessonIdsByModule["Presenter Induction"][0],
    status: "completed",
    completed_at: daysFromNow(-22)
  }
];

{
  const { error } = await admin.from("training_progress").insert(progressRows);
  if (error) fail("creating training progress", error);
}

// ---------------------------------------------------------------- resources
console.log("Creating demo ambassador resources...");
const resourceSeed = [
  {
    title: "Digital Wellbeing slide deck",
    description: "The current presentation deck with speaker notes for the Digital Wellbeing talk.",
    resource_type: "slide_deck",
    public_url: "https://docs.google.com/presentation/d/demo-digital-wellbeing",
    presentation: "digital-wellbeing"
  },
  {
    title: "Session delivery checklist",
    description: "Pre-visit checklist: AV requirements, arrival times, and school sign-in steps.",
    resource_type: "pdf",
    public_url: "https://example.org/nz-esports/delivery-checklist.pdf"
  },
  {
    title: "Presenting to assemblies — tips",
    description: "A short video on pacing, energy, and handling big-room Q&A.",
    resource_type: "youtube",
    youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  },
  {
    title: "Presenter induction video",
    description: "A short video covering pacing, energy, and handling big-room Q&A.",
    resource_type: "video",
    youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  },
  {
    title: "Assembly delivery script",
    description: "Full script and speaker notes for delivering the assembly session.",
    resource_type: "script",
    public_url: "https://docs.google.com/document/d/demo-assembly-script"
  },
  {
    title: "Managing Q&A",
    description: "Tips for handling tricky questions and keeping the session on track.",
    resource_type: "script",
    public_url: "https://docs.google.com/document/d/demo-managing-qa"
  }
];

for (const resource of resourceSeed) {
  const { error } = await admin.from("presentation_resources").insert({
    title: resource.title,
    description: resource.description,
    resource_type: resource.resource_type,
    public_url: resource.public_url ?? null,
    youtube_url: resource.youtube_url ?? null,
    presentation_type_id: resource.presentation ? presentationId(resource.presentation) : null,
    audiences: ["ambassador"],
    tags: ["demo"],
    is_current: true,
    is_active: true
  });
  if (error) fail(`creating resource ${resource.title}`, error);
}

// ---------------------------------------------------------------- reports
console.log("Creating demo session reports and payments...");
const reports = [
  {
    booking_session_id: session1,
    ambassador_profile_id: marcusProfileId,
    presenter_name: "Demo Marcus Chen",
    delivered_at: daysFromNow(-21, 9, 10),
    attendee_count: 240,
    year_levels: "Years 9 to 13",
    first_presentation_to_school: true,
    media_consent_confirmed: true,
    attendance_rating: 5,
    student_response_rating: 5,
    teacher_response_rating: 4,
    presentation_energy_rating: 5,
    student_questions_themes: "Lots of questions about careers in casting and event production.",
    presentation_feedback: "Great energy — the head of PE wants a follow-up careers session.",
    attendee_quotes: "“I didn't know esports had real jobs behind it.” — Year 12 student"
  },
  {
    booking_session_id: session2,
    ambassador_profile_id: arohaProfileId,
    presenter_name: "Demo Aroha Ngata",
    delivered_at: daysFromNow(-14, 11, 40),
    attendee_count: 195,
    year_levels: "Years 7 to 8",
    first_presentation_to_school: false,
    media_consent_confirmed: true,
    attendance_rating: 4,
    student_response_rating: 4,
    teacher_response_rating: 5,
    presentation_energy_rating: 4,
    student_questions_themes: "Screen-time balance and how to talk to parents about gaming.",
    presentation_feedback: "Deans asked for the whānau resource pack to send home."
  }
];

for (const report of reports) {
  const { error } = await admin.from("ambassador_reports").insert(report);
  if (error) fail("creating ambassador report", error);
}

const payments = [
  {
    booking_session_id: session1,
    ambassador_profile_id: marcusProfileId,
    amount_cents: 25000,
    status: "paid",
    eligibility_reason: "Attendance over threshold",
    invoice_number: "DEMO-INV-001",
    invoice_submitted_at: daysFromNow(-18),
    sent_to_finance_at: daysFromNow(-16),
    paid_at: daysFromNow(-12)
  },
  {
    booking_session_id: session2,
    ambassador_profile_id: arohaProfileId,
    amount_cents: 25000,
    status: "pending",
    eligibility_reason: "Attendance over threshold"
  }
];

for (const payment of payments) {
  const { error } = await admin.from("payments").insert(payment);
  if (error) fail("creating payment", error);
}

// ---------------------------------------------------------------- reviews
console.log("Creating demo public testimonials...");
const reviews = [
  {
    presentation_type_id: presentationId("digital-wellbeing"),
    school_id: schoolIds["Demo Rangitoto College"],
    quote:
      "The presenter had our Year 7s completely engaged — screen-time conversations at home have genuinely shifted.",
    attribution: "Deputy Principal, Demo Rangitoto College",
    rating: 5,
    is_approved: true,
    is_public: true
  },
  {
    presentation_type_id: presentationId("esports-pathways"),
    school_id: schoolIds["Demo Wellington High School"],
    quote:
      "Ten tight minutes in assembly and students were still talking about esports careers a week later.",
    attribution: "HOD Digital Technologies, Demo Wellington High School",
    rating: 5,
    is_approved: true,
    is_public: true
  },
  {
    presentation_type_id: presentationId("careers"),
    school_id: schoolIds["Demo Christchurch Boys' High"],
    quote: "A fresh way into careers kōrero for students we usually struggle to reach.",
    attribution: "Careers Advisor, Demo Christchurch Boys' High",
    rating: 4,
    is_approved: true,
    is_public: true
  }
];

for (const review of reviews) {
  const { error } = await admin.from("presentation_reviews").insert(review);
  if (error) fail("creating review", error);
}

// ---------------------------------------------------------------- notifications
console.log("Creating demo staff notifications...");
for (const staff of staffProfiles ?? []) {
  const { error } = await admin.from("notifications").insert([
    {
      user_id: staff.id,
      title: "New booking request from Demo Tauranga Intermediate",
      body: "Demo Sam Green submitted 2 requested sessions.",
      notification_type: "booking_request_submitted",
      related_url: "/staff/bookings"
    },
    {
      user_id: staff.id,
      title: "Demo Sophie Williams applied to be an ambassador",
      body: "A new ambassador application is waiting for review.",
      notification_type: "ambassador_application_submitted",
      related_url: "/staff/ambassadors"
    }
  ]);
  if (error) fail("creating notifications", error);
}

console.log("");
console.log("Done! Demo data seeded.");
console.log("");
console.log("Demo portal logins (all use the same password):");
console.log(`  Password:          ${DEMO_PASSWORD}`);
console.log(`  Ambassador:        aroha.ambassador@${DEMO_EMAIL_DOMAIN}  (approved, has history + pending payment)`);
console.log(`  Ambassador:        marcus.ambassador@${DEMO_EMAIL_DOMAIN} (approved, paid session + open application)`);
console.log(`  Ambassador:        sophie.ambassador@${DEMO_EMAIL_DOMAIN} (awaiting approval — shows the review queue)`);
console.log(`  School contact:    jordan.school@${DEMO_EMAIL_DOMAIN}     (Demo Rangitoto College)`);
console.log("");
console.log("Remove everything again with: node scripts/remove-demo-data.mjs");
