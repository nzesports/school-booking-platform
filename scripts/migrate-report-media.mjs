// One-off migration: moves historical ambassador report media (photos, videos,
// signed release forms) out of the world-readable `public-assets` bucket into
// the private `report-media` bucket, points each media_library row at the
// auth-gated /portal/report-media/[mediaId] route, and deletes the public copy
// only after the private copy and row update are confirmed.
//
// Safe to re-run: rows whose public_url no longer starts with http(s) are
// skipped, and uploads use upsert so a partially migrated run can resume.
//
// Run from the project root:
//   node scripts/migrate-report-media.mjs --dry-run              (list what would move)
//   node scripts/migrate-report-media.mjs                        (apply)
//   node scripts/migrate-report-media.mjs --env .env.production  (use another env file)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
const envFlagIndex = process.argv.indexOf("--env");
const ENV_FILE = envFlagIndex === -1 ? ".env.local" : process.argv[envFlagIndex + 1];

const envText = readFileSync(ENV_FILE, "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const CONTENT_TYPES = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["mp4", "video/mp4"],
  ["mov", "video/quicktime"],
  ["webm", "video/webm"],
  ["pdf", "application/pdf"]
]);

function contentTypeFor(path) {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return CONTENT_TYPES.get(extension) ?? "application/octet-stream";
}

// Legacy rows may lack storage_path; recover it from the Supabase public URL
// (<url>/storage/v1/object/public/public-assets/<path>).
function publicBucketPath(row) {
  if (row.storage_path) return row.storage_path;
  const marker = "/object/public/public-assets/";
  const index = row.public_url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(row.public_url.slice(index + marker.length).split("?")[0]);
}

const { data: rows, error: listError } = await admin
  .from("media_library")
  .select("id, report_id, storage_path, public_url, media_type, title")
  .not("report_id", "is", null)
  .or("public_url.like.http://%,public_url.like.https://%")
  .order("id");

if (listError) {
  console.error(`Failed to list media rows: ${listError.message}`);
  process.exit(1);
}

if (!rows?.length) {
  console.log("No legacy public report media found — nothing to migrate.");
  process.exit(0);
}

console.log(`${rows.length} legacy public report media row(s) found.${DRY_RUN ? " (dry run)" : ""}`);

let migrated = 0;
let failed = 0;

for (const row of rows) {
  const sourcePath = publicBucketPath(row);
  const label = `${row.id} (${row.media_type}: ${row.title ?? "untitled"})`;

  if (!sourcePath) {
    console.error(`${label}: SKIPPED — could not derive public-assets path from ${row.public_url}`);
    failed += 1;
    continue;
  }

  if (DRY_RUN) {
    console.log(`${label}: would move public-assets/${sourcePath} -> report-media/${sourcePath}`);
    migrated += 1;
    continue;
  }

  const { data: file, error: downloadError } = await admin.storage
    .from("public-assets")
    .download(sourcePath);

  if (downloadError || !file) {
    console.error(`${label}: FAILED download of ${sourcePath} — ${downloadError?.message ?? "no data"}`);
    failed += 1;
    continue;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("report-media")
    .upload(sourcePath, buffer, { contentType: contentTypeFor(sourcePath), upsert: true });

  if (uploadError) {
    console.error(`${label}: FAILED upload — ${uploadError.message}`);
    failed += 1;
    continue;
  }

  const { error: updateError } = await admin
    .from("media_library")
    .update({ storage_path: sourcePath, public_url: `/portal/report-media/${row.id}` })
    .eq("id", row.id);

  if (updateError) {
    console.error(`${label}: FAILED row update — ${updateError.message} (private copy kept, public copy untouched)`);
    failed += 1;
    continue;
  }

  const { error: removeError } = await admin.storage.from("public-assets").remove([sourcePath]);

  if (removeError) {
    console.error(`${label}: migrated, but public copy not removed — ${removeError.message}`);
  } else {
    console.log(`${label}: moved and public copy removed.`);
  }

  migrated += 1;
}

console.log(
  `Done. ${migrated} ${DRY_RUN ? "would be migrated" : "migrated"}, ${failed} failed.`
);
if (failed) process.exitCode = 1;
