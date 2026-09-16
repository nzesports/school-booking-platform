"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateNotificationAction(id: string, intent: "read" | "dismiss") {
  const parsed = z.object({ id: z.string().uuid(), intent: z.enum(["read", "dismiss"]) }).safeParse({ id, intent });
  if (!parsed.success) return { error: "Invalid notification." };
  const client = await createClient();
  if (!client) return { error: "Notifications are unavailable. Please retry." };
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: "Please sign in again to update notifications." };
  const admin = createAdminClient();
  if (!admin) return { error: "Notifications are unavailable. Please retry." };

  // Clearing only removes the recipient's notification, never its related activity.
  const query = parsed.data.intent === "dismiss"
    ? admin.from("notifications").delete()
    : admin.from("notifications").update({ read_at: new Date().toISOString() });
  const { data, error } = await query.eq("id", parsed.data.id).eq("user_id", user.id).select("id");
  if (error || !data?.length) return { error: "Could not update this notification. Please retry." };
  for (const portal of ["/admin", "/staff", "/school", "/ambassador"]) {
    revalidatePath(portal, "layout");
  }
  return { success: true };
}
