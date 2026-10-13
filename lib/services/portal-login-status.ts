import { createAdminClient } from "@/lib/supabase/admin";

// Whether a portal login has been set up yet. Invited users stay "pending"
// until they open their invite link and confirm their email.
export type PortalLoginStatus = {
  state: "pending" | "active";
  invitedAt?: string;
  lastSignInAt?: string;
};

export async function loadPortalLoginStatus(userId: string): Promise<PortalLoginStatus | null> {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error || !data.user) {
    return null;
  }

  return {
    state: data.user.email_confirmed_at ? "active" : "pending",
    invitedAt: data.user.invited_at ?? undefined,
    lastSignInAt: data.user.last_sign_in_at ?? undefined
  };
}
