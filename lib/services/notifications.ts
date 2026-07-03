import { createAdminClient } from "@/lib/supabase/admin";

export async function notifyStaff(input: {
  title: string;
  body: string;
  type: string;
  relatedUrl?: string;
}) {
  const admin = createAdminClient();

  if (!admin) {
    return;
  }

  const { data: staff } = await admin
    .from("profiles")
    .select("id")
    .in("role", ["staff", "super_admin"])
    .eq("status", "active");

  if (!staff?.length) {
    return;
  }

  await admin.from("notifications").insert(
    staff.map((profile) => ({
      user_id: profile.id,
      title: input.title,
      body: input.body,
      notification_type: input.type,
      related_url: input.relatedUrl ?? null
    }))
  );
}

export async function notifyUser(
  userId: string,
  input: {
    title: string;
    body: string;
    type: string;
    relatedUrl?: string;
  }
) {
  const admin = createAdminClient();

  if (!admin) {
    return;
  }

  await admin.from("notifications").insert({
    user_id: userId,
    title: input.title,
    body: input.body,
    notification_type: input.type,
    related_url: input.relatedUrl ?? null
  });
}
