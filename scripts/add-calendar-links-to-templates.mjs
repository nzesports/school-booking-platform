// Appends the {{calendarLinks}} placeholder (add-to-calendar buttons) to the
// booking confirmed + rescheduled email templates. Idempotent — skips rows
// that already contain the placeholder.
//
// Run from the project root:  node scripts/add-calendar-links-to-templates.mjs

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

for (const key of ["school_booking_confirmed", "school_booking_rescheduled"]) {
  const { data: row, error } = await admin
    .from("email_templates")
    .select("id, body_html")
    .eq("template_key", key)
    .maybeSingle();

  if (error) {
    console.error(`FAILED reading ${key}:`, error.message);
    process.exit(1);
  }

  if (!row) {
    console.log(`Skipped (no row): ${key}`);
    continue;
  }

  if (row.body_html.includes("{{calendarLinks}}")) {
    console.log(`Skipped (already has calendar links): ${key}`);
    continue;
  }

  const { error: updateError } = await admin
    .from("email_templates")
    .update({ body_html: `${row.body_html}<p>{{calendarLinks}}</p>` })
    .eq("id", row.id);

  if (updateError) {
    console.error(`FAILED updating ${key}:`, updateError.message);
    process.exit(1);
  }

  console.log(`Updated: ${key}`);
}

console.log("Done.");
