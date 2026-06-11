import Link from "next/link";
import { redirect } from "next/navigation";

import { updatePasswordAction } from "@/app/auth/actions";
import { AuthField } from "@/components/auth/auth-field";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const messages: Record<string, string> = {
  "password-mismatch": "Make sure both password fields match and meet the minimum length.",
  "reset-failed": "We couldn't update your password. Please request a fresh reset link.",
  "supabase-unavailable": "Authentication is not configured yet in this environment."
};

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, supabase] = await Promise.all([searchParams, createClient()]);
  const errorKey = typeof query.error === "string" ? query.error : null;

  if (!supabase) {
    redirect("/login?error=supabase-unavailable");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=reset-failed");
  }

  return (
    <main className="site-shell-narrow flex min-h-[70vh] items-center justify-center py-20">
      <Card className="w-full max-w-xl rounded-[34px]">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Reset password
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-[color:var(--navy)]">
          Choose a new password.
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-soft)]">
          Set a strong password for {user.email}. Once this is saved, you’ll log in again with the
          new password.
        </p>

        {errorKey && messages[errorKey] ? (
          <p className="mt-6 rounded-[22px] border border-[rgba(180,35,24,0.14)] bg-[#fff6f6] px-4 py-4 text-sm leading-7 text-[#9d2424]">
            {messages[errorKey]}
          </p>
        ) : null}

        <form action={updatePasswordAction} className="mt-8 grid gap-5">
          <AuthField label="New password">
            <PasswordInput name="password" placeholder="Create a new password" required />
          </AuthField>
          <AuthField label="Confirm password">
            <PasswordInput name="confirmPassword" placeholder="Repeat your password" required />
          </AuthField>
          <SubmitButton type="submit" pendingLabel="Updating password..." className="w-full justify-center">
            Update password
          </SubmitButton>
        </form>

        <p className="mt-6 text-sm text-[color:var(--text-soft)]">
          Need a new reset link?{" "}
          <Link href="/forgot-password" className="font-semibold text-[color:var(--navy)]">
            Request another one
          </Link>
        </p>
      </Card>
    </main>
  );
}
