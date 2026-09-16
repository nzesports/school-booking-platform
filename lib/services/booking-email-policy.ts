import { createAdminClient } from "@/lib/supabase/admin";

export async function bookingEmailPolicy(bookingId?: string, sessionId?: string) {
  if (!bookingId && !sessionId) return null;
  const admin = createAdminClient();
  if (!admin) throw new Error("Cannot verify booking email policy.");
  if (!bookingId) {
    const { data, error } = await admin.from("booking_sessions")
      .select("booking_request_id").eq("id", sessionId!).single();
    if (error) throw new Error("Cannot verify booking email policy.");
    bookingId = data.booking_request_id;
  }
  const { data, error } = await admin.from("booking_requests")
    .select("id, manual_email_only, import_batch_id").eq("id", bookingId!).single();
  // Fail closed, including during a deployment with an unapplied migration.
  if (error) throw new Error("Cannot verify booking email policy.");
  return { id: data.id as string, manualOnly: Boolean(data.manual_email_only), imported: Boolean(data.import_batch_id) };
}
