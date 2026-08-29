import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const LOCAL_PASSWORD = "LocalTest123!";
const localUsers = [
  { email: "admin@local.test", fullName: "Local Super Admin", role: "super_admin" },
  { email: "staff@local.test", fullName: "Local Staff User", role: "staff" }
];

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
}

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function findUser(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email === email);
    if (user) return user;
    if (data.users.length < 100) return null;
  }
}

async function ensureLocalUser({ email, fullName, role }) {
  let user = await findUser(email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: LOCAL_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: "ambassador",
        full_name: fullName,
        experience: "Local development account"
      }
    });
    if (error) throw error;
    user = data.user;
  }

  const { data: ambassadorProfile, error: lookupError } = await admin
    .from("ambassador_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (ambassadorProfile) {
    await admin
      .from("notifications")
      .delete()
      .eq("related_url", `/staff/ambassadors/${ambassadorProfile.id}`);

    const { error } = await admin
      .from("ambassador_profiles")
      .delete()
      .eq("id", ambassadorProfile.id);
    if (error) throw error;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, role, status: "active" })
    .eq("id", user.id);
  if (profileError) throw profileError;
}

try {
  for (const user of localUsers) await ensureLocalUser(user);

  console.log("Created local admin/staff accounts:");
  for (const user of localUsers) {
    console.log(`  ${user.email} / ${LOCAL_PASSWORD}`);
  }
} catch (error) {
  console.error("Failed to seed local portal users:", error.message ?? error);
  process.exit(1);
}
