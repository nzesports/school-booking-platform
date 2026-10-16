// Corrects the star ratings on a single school review.
//
// The feedback hub can approve or publish a review but cannot change its
// scores, so a mis-clicked rating (for example all five stars left at 1 while
// the written review is glowing) has no in-app fix. This is that fix.
//
// The reviewer's own words are never touched. Only the four category scores
// and the derived overall change, and the original values stay on the record
// under `originalRatings` so the edit is always traceable.
//
// Usage:
//   node scripts/correct-review-rating.mjs --review <uuid> --rating 5
//   node scripts/correct-review-rating.mjs --review <uuid> --rating 5 --apply
//
// Without --apply it prints what it would do and changes nothing.

import { readFileSync } from "node:fs";

const RATING_KEYS = [
  "attendanceRating",
  "studentResponseRating",
  "contentRating",
  "presenterEnergyRating",
];

function parseArguments(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument.startsWith("--")) {
      continue;
    }

    const key = argument.slice(2);

    if (key === "apply" || key === "dry-run") {
      result[key] = true;
      continue;
    }

    result[key] = argv[index + 1];
    index += 1;
  }

  return result;
}

function loadEnvironment() {
  const env = {};

  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

    if (match) {
      env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  }

  return env;
}

const options = parseArguments(process.argv.slice(2));
const reviewId = options.review;
const rating = Number(options.rating);
const apply = Boolean(options.apply);

if (!reviewId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
  console.error("Usage: node scripts/correct-review-rating.mjs --review <uuid> --rating <1-5> [--apply]");
  process.exit(1);
}

if (!Number.isInteger(rating)) {
  console.error("Category scores are whole stars. Pass an integer 1-5; the overall is derived from it.");
  process.exit(1);
}

const env = loadEnvironment();
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const readResponse = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/presentation_reviews?id=eq.${reviewId}&select=*`,
  { headers }
);

if (!readResponse.ok) {
  console.error(`Read failed: HTTP ${readResponse.status} ${(await readResponse.text()).slice(0, 300)}`);
  process.exit(1);
}

const [row] = await readResponse.json();

if (!row) {
  console.error(`No review found with id ${reviewId}`);
  process.exit(1);
}

if (row.details?.ratingCorrectedAt) {
  console.error(`This review was already corrected on ${row.details.ratingCorrectedAt}. Refusing to overwrite the stored originals.`);
  process.exit(1);
}

const originalRatings = Object.fromEntries(
  RATING_KEYS.map((key) => [key, row.details?.[key] ?? null])
);

const details = {
  ...row.details,
  ...Object.fromEntries(RATING_KEYS.map((key) => [key, rating])),
  originalRatings,
  originalOverallRating: row.rating,
  ratingCorrectedAt: new Date().toISOString(),
  ratingCorrectionReason:
    "Star ratings contradicted the written review and were corrected to match it. The quote and every other answer are unchanged; the submitted scores are preserved in originalRatings.",
};

const overall =
  Math.round((RATING_KEYS.reduce((sum, key) => sum + details[key], 0) / RATING_KEYS.length) * 10) / 10;

console.log(`Review      : ${row.id}`);
console.log(`Attribution : ${row.attribution}`);
console.log(`Published   : is_public=${row.is_public} is_approved=${row.is_approved}`);
console.log(`Quote       : ${String(row.quote || "").slice(0, 120).replace(/\s+/g, " ")}`);
console.log("");

for (const key of RATING_KEYS) {
  console.log(`  ${key.replace("Rating", "").padEnd(16)} ${originalRatings[key]}  ->  ${rating}`);
}

console.log(`  ${"overall".padEnd(16)} ${row.rating}  ->  ${overall}`);

// Returning rather than calling process.exit lets the fetch sockets close on
// their own; exiting mid-flight makes Node abort with a libuv assertion.
if (apply) {
  const patchResponse = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/presentation_reviews?id=eq.${reviewId}`,
    { method: "PATCH", headers, body: JSON.stringify({ rating: overall, details }) }
  );

  if (!patchResponse.ok) {
    console.error(`Write failed: HTTP ${patchResponse.status} ${(await patchResponse.text()).slice(0, 300)}`);
    process.exitCode = 1;
  } else {
    const [updated] = await patchResponse.json();

    console.log("\nApplied.");
    console.log(`  overall now     : ${updated.rating}`);
    console.log(`  quote unchanged : ${updated.quote === row.quote}`);
    console.log(`  originals kept  : ${JSON.stringify(updated.details.originalRatings)}`);
  }
} else {
  console.log("\nDry run. Nothing was changed. Re-run with --apply to write it.");
}
