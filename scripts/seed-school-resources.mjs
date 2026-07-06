// Seeds a few school-facing resources so the school portal resource layouts
// have content to show. Idempotent — skips titles that already exist.
//
// Run from the project root:  node scripts/seed-school-resources.mjs

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

const { data: digitalWellbeing } = await admin
  .from("presentation_types")
  .select("id")
  .eq("slug", "digital-wellbeing")
  .maybeSingle();

const resources = [
  {
    title: "School visit preparation checklist",
    description:
      "Everything to have ready before our ambassador arrives: venue, AV setup, timings, and who to meet at the office.",
    resource_type: "pdf",
    public_url: "https://nzesports.org.nz/resources/school-visit-checklist.pdf",
    audiences: ["school"],
    tags: ["prep", "checklist"],
    version_label: "v1",
    is_current: true,
    is_active: true
  },
  {
    title: "Digital Wellbeing — parent & whānau flyer",
    description:
      "A one-page flyer schools can send home covering healthy screen habits and what students learned in the session.",
    resource_type: "pdf",
    public_url: "https://nzesports.org.nz/resources/digital-wellbeing-flyer.pdf",
    presentation_type_id: digitalWellbeing?.id ?? null,
    audiences: ["school"],
    tags: ["flyer", "parents"],
    version_label: "v1",
    is_current: true,
    is_active: true
  },
  {
    title: "What to expect on presentation day",
    description:
      "A short video walkthrough of how a typical NZ Esports school visit runs, from arrival to Q&A.",
    resource_type: "youtube",
    youtube_url: "https://www.youtube.com/watch?v=ScMzIvxBSi4",
    audiences: ["school", "ambassador"],
    tags: ["video", "prep"],
    version_label: "v1",
    is_current: true,
    is_active: true
  }
];

for (const resource of resources) {
  const { data: existing } = await admin
    .from("presentation_resources")
    .select("id")
    .eq("title", resource.title)
    .maybeSingle();

  if (existing) {
    console.log(`Skipped (already exists): ${resource.title}`);
    continue;
  }

  const { error } = await admin.from("presentation_resources").insert(resource);

  if (error) {
    console.error(`FAILED inserting ${resource.title}:`, error.message);
    process.exit(1);
  }

  console.log(`Inserted: ${resource.title}`);
}

console.log("School resources seeded.");
