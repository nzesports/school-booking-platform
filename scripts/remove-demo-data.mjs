// Removes everything created by scripts/seed-demo-data.mjs: rows tied to
// "Demo %" schools, reviews/notifications mentioning Demo, and the
// @demo.esf.nz auth accounts (their profiles cascade).
//
// Run from the project root:  node scripts/remove-demo-data.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DEMO_EMAIL_DOMAIN = "demo.esf.nz";

const envText = readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function report(step, error, count) {
  if (error) {
    console.error(`${step}: FAILED — ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`${step}: ok${typeof count === "number" ? ` (${count})` : ""}`);
  }
}

const { data: demoSchools } = await admin.from("schools").select("id").ilike("name", "Demo %");
const schoolIds = (demoSchools ?? []).map((school) => school.id);

const { data: demoSessions } = schoolIds.length
  ? await admin.from("booking_sessions").select("id").in("school_id", schoolIds)
  : { data: [] };
const sessionIds = (demoSessions ?? []).map((session) => session.id);

const { data: demoRequests } = schoolIds.length
  ? await admin.from("booking_requests").select("id").in("school_id", schoolIds)
  : { data: [] };
const requestIds = (demoRequests ?? []).map((request) => request.id);

if (sessionIds.length) {
  report("payments", (await admin.from("payments").delete().in("booking_session_id", sessionIds)).error);
  report(
    "session applications",
    (await admin.from("booking_session_applications").delete().in("booking_session_id", sessionIds)).error
  );
  report(
    "ambassador reports",
    (await admin.from("ambassador_reports").delete().in("booking_session_id", sessionIds)).error
  );
}

if (requestIds.length) {
  report(
    "activity logs",
    (await admin.from("booking_activity_logs").delete().in("booking_request_id", requestIds)).error
  );
  report(
    "status history",
    (await admin.from("booking_status_history").delete().in("booking_request_id", requestIds)).error
  );
  report(
    "booking sessions",
    (await admin.from("booking_sessions").delete().in("booking_request_id", requestIds)).error
  );
  report("booking requests", (await admin.from("booking_requests").delete().in("id", requestIds)).error);
}

report(
  "reviews",
  (await admin.from("presentation_reviews").delete().ilike("attribution", "%demo%")).error
);
report("notifications", (await admin.from("notifications").delete().ilike("title", "%demo%")).error);

// Seeded training modules (lessons + progress cascade with the module).
const demoTrainingTitles = ["Presenter Induction", "Digital Wellbeing Delivery Pack"];
report(
  "training modules",
  (await admin.from("training_modules").delete().in("title", demoTrainingTitles)).error
);

report(
  "demo resources",
  (await admin.from("presentation_resources").delete().contains("tags", ["demo"])).error
);

if (schoolIds.length) {
  report(
    "school contact links",
    (
      await admin
        .from("school_contact_users")
        .delete()
        .in(
          "school_contact_id",
          ((await admin.from("school_contacts").select("id").in("school_id", schoolIds)).data ?? []).map(
            (contact) => contact.id
          )
        )
    ).error
  );
  report("school contacts", (await admin.from("school_contacts").delete().in("school_id", schoolIds)).error);
  report("schools", (await admin.from("schools").delete().in("id", schoolIds)).error, schoolIds.length);
}

// Auth users last — their profiles/ambassador rows cascade once nothing
// references them.
const { data: demoProfiles } = await admin
  .from("profiles")
  .select("id, email")
  .ilike("email", `%@${DEMO_EMAIL_DOMAIN}`);

for (const profile of demoProfiles ?? []) {
  const { error } = await admin.auth.admin.deleteUser(profile.id);
  report(`auth user ${profile.email}`, error);
}

console.log("Demo data removal finished.");
