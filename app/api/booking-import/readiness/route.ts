import { createHash } from "node:crypto";
import { config } from "@/lib/env";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Public capability probe: no booking data or credentials are exposed.
export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ready: false }, { status: 503 });
  const { error } = await admin.from("booking_requests").select("manual_email_only, import_batch_id").limit(1);
  return NextResponse.json({ ready: !error, policyVersion: 1, databaseFingerprint: createHash("sha256").update(config.supabaseUrl || "").digest("hex") }, {
    status: error ? 503 : 200, headers: { "Cache-Control": "no-store" }
  });
}
