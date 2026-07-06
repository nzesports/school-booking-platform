// One-off: updates the homepage_sections rows in the live database to the
// July 2026 copy refresh (hero body, how-it-works body, CTA title + body).
// The seed file carries the same copy for fresh installs.
//
// Run from the project root:  node scripts/update-homepage-copy.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const updates = [
  {
    section_key: "hero",
    patch: {
      body: "Free, school-ready presentations on digital wellbeing, screen time, esports careers and pathways, delivered by NZ Esports ambassadors during your school assembly."
    }
  },
  {
    section_key: "how_it_works",
    patch: {
      title: "How school bookings work",
      body: "Build a visit around your students, select your preferred date, and our team will confirm everything with you."
    }
  },
  {
    section_key: "cta",
    patch: {
      title: "Bring esports into the conversation, the right way",
      body: "Gaming is already part of students’ lives. Invite our ambassadors to help your school create a supportive, balanced conversation around esports, play and positive digital habits."
    }
  }
];

for (const update of updates) {
  const { error, count } = await admin
    .from("homepage_sections")
    .update(update.patch, { count: "exact" })
    .eq("section_key", update.section_key);

  if (error) {
    console.error(`FAILED updating ${update.section_key}:`, error.message);
    process.exit(1);
  }

  console.log(`Updated ${update.section_key} (${count ?? 0} row(s)).`);
}

console.log("Homepage copy updated.");
