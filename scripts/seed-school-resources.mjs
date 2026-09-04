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
    title: "School esports club launch checklist",
    description:
      "A practical checklist for planning your club, finding student leaders, setting expectations, and preparing your first session.",
    resource_type: "pdf",
    public_url:
      "https://www.nzesports.org.nz/wp-content/uploads/2025/01/The-Ultimate-Guide-How-To-Start-An-Esports-Club.pdf",
    audiences: ["school"],
    tags: ["schools", "esports clubs", "checklist"],
    version_label: "v1",
    category: "resource",
    sharing_scope: "public",
    is_current: true,
    is_active: true
  },
  {
    title: "The ultimate guide to starting an esports club",
    description:
      "A step-by-step guide for schools creating a safe, sustainable and student-led esports club.",
    resource_type: "pdf",
    public_url:
      "https://www.nzesports.org.nz/wp-content/uploads/2025/01/The-Ultimate-Guide-How-To-Start-An-Esports-Club.pdf",
    audiences: ["school"],
    tags: ["schools", "esports clubs", "guide"],
    version_label: "v1",
    category: "resource",
    sharing_scope: "public",
    is_current: true,
    is_active: true
  },
  {
    title: "Digital wellbeing: recognising when your brain needs a break",
    description:
      "A short student-friendly video schools can revisit after the Digital Wellbeing presentation.",
    resource_type: "youtube",
    youtube_url: "https://www.youtube.com/watch?v=K5_uQXgS0tI",
    presentation_type_id: digitalWellbeing?.id ?? null,
    audiences: ["school"],
    tags: ["digital wellbeing", "video"],
    version_label: "v1",
    category: "resource",
    sharing_scope: "public",
    is_current: true,
    is_active: true
  },
  {
    title: "How esports can improve student wellbeing",
    description:
      "A practical article for school leaders covering belonging, confidence, resilience and leadership through structured esports.",
    resource_type: "link",
    public_url: "https://www.nzesports.org.nz/knowledge-base/how-esports-improves-your-wellbeing/",
    audiences: ["school"],
    tags: ["wellbeing", "schools", "guide"],
    version_label: "v1",
    category: "resource",
    sharing_scope: "public",
    is_current: true,
    is_active: true
  }
];

async function writeResource(resource, existingId) {
  const write = (payload) =>
    existingId
      ? admin.from("presentation_resources").update(payload).eq("id", existingId)
      : admin.from("presentation_resources").insert(payload);

  const firstAttempt = await write(resource);
  if (!firstAttempt.error) return null;

  if (!/sharing_scope/i.test(firstAttempt.error.message)) {
    return firstAttempt.error;
  }

  // Compatibility for configured demo databases that have not received
  // migration 0031 yet. In those schemas, the school audience is the sharing
  // signal and the portal maps it to Public.
  const legacyResource = { ...resource };
  delete legacyResource.sharing_scope;
  const legacyAttempt = await write(legacyResource);
  return legacyAttempt.error;
}

for (const resource of resources) {
  const { data: existing } = await admin
    .from("presentation_resources")
    .select("id")
    .eq("title", resource.title)
    .maybeSingle();

  if (existing) {
    const error = await writeResource(resource, existing.id);

    if (error) {
      console.error(`FAILED updating ${resource.title}:`, error.message);
      process.exit(1);
    }

    console.log(`Updated: ${resource.title}`);
    continue;
  }

  const error = await writeResource(resource);

  if (error) {
    console.error(`FAILED inserting ${resource.title}:`, error.message);
    process.exit(1);
  }

  console.log(`Inserted: ${resource.title}`);
}

console.log("School resources seeded.");
