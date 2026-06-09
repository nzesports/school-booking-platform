import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="site-shell-narrow flex min-h-[65vh] items-center justify-center py-20">
      <Card className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Login scaffold
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-[color:var(--navy)]">
          Mixed-auth entry point for staff, ambassadors, admins, and school accounts.
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
          This implementation sets up the shared route structure and Supabase client hooks.
          The next step is connecting real sign-in flows and role-based redirects once the
          Supabase project and auth settings are ready.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/magic-link">Request a magic link</ButtonLink>
          <ButtonLink href="/school" variant="secondary">
            Open school portal scaffold
          </ButtonLink>
        </div>
      </Card>
    </main>
  );
}
