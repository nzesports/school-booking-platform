import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envText = readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const { data: profile } = await admin
  .from("profiles")
  .select("id")
  .ilike("email", "aroha.ambassador@%")
  .maybeSingle();
const { data: aroha } = await admin
  .from("ambassador_profiles")
  .select("id")
  .eq("user_id", profile?.id ?? "")
  .maybeSingle();

if (!aroha) {
  console.log("Aroha not found — run scripts/seed-demo-data.mjs first.");
  process.exit(1);
}

// Phone on the auth profile
{
  const { error } = await admin
    .from("profiles")
    .update({ phone: "+64 21 123 4567" })
    .eq("id", profile.id);
  console.log(`phone: ${error ? error.message : "ok"}`);
}

// Existing ambassador_profiles columns
{
  const { error } = await admin
    .from("ambassador_profiles")
    .update({
      bank_account_name: "Demo Aroha Ngata",
      bank_account_number: "12-3456-7890123-00",
      gst_number: "123-456-789"
    })
    .eq("id", aroha.id);
  console.log(`bank details: ${error ? error.message : "ok"}`);
}

// Travel regions (Auckland cluster like the mock)
{
  const { data: regionRows } = await admin
    .from("regions")
    .select("id, slug")
    .in("slug", ["auckland-central", "north-shore", "west-auckland", "south-auckland"]);

  await admin.from("ambassador_travel_regions").delete().eq("ambassador_profile_id", aroha.id);
  const { error } = await admin.from("ambassador_travel_regions").insert(
    (regionRows ?? []).map((region) => ({
      ambassador_profile_id: aroha.id,
      region_id: region.id
    }))
  );
  console.log(`travel regions: ${error ? error.message : "ok"}`);
}

// profile_details (only works once catch-up.sql / 0011 has been run)
{
  const { error } = await admin
    .from("ambassador_profiles")
    .update({
      profile_details: {
        mailingAddress: "12 Example Street, Eden Terrace, Auckland 1010, New Zealand",
        payoutEmail: "payouts@example.com",
        payoutMethod: "bank_transfer",
        invoiceName: "Demo Aroha Ngata",
        irdNumber: "123-456-789",
        billingNote: "Please include event name on invoice.",
        bookingTypes: ["in_person", "school_talks", "workshops"],
        preferredTimes: "Mon, Wed, Fri: 9:00 am - 12:00 pm\nTue, Thu: 1:00 pm - 4:00 pm",
        weeklyAvailability: {
          mon: "9am-12pm",
          tue: "1pm-4pm",
          wed: "9am-12pm",
          thu: "1pm-4pm",
          fri: "9am-12pm"
        },
        unavailableDates: ["12-14 Jun 2026", "22 Jul 2026", "5-9 Aug 2026"],
        availabilityNote: "Requires at least 7 days notice."
      }
    })
    .eq("id", aroha.id);

  if (error && error.message.includes("profile_details")) {
    console.log(
      "profile_details: column missing — run supabase/catch-up.sql in the SQL editor, then re-run this."
    );
  } else {
    console.log(`profile_details: ${error ? error.message : "ok"}`);
  }
}

console.log("Done.");
