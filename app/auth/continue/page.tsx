import { SubmitButton } from "@/components/auth/submit-button";
import { Card } from "@/components/ui/card";
import { safeLocalPath } from "@/lib/safe-redirect";

const copy: Record<string, { kicker: string; title: string; body: string; button: string }> = {
  invite: {
    kicker: "Welcome aboard",
    title: "Set up your account.",
    body: "You've been invited to the NZ Esports portal. Continue to create your password.",
    button: "Continue to set up"
  },
  recovery: {
    kicker: "Password",
    title: "Choose your password.",
    body: "Continue to set a password for your NZ Esports portal account.",
    button: "Continue"
  }
};

const fallbackCopy = {
  kicker: "One more step",
  title: "Confirm your email.",
  body: "Continue to finish confirming your email address.",
  button: "Continue"
};

/**
 * Landing page for one-time email links. The token is only used when the
 * person presses Continue, so email security scanners that open links
 * automatically can't use it up first. See app/auth/confirm/route.ts.
 */
export default async function AuthContinuePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const tokenHash = typeof query.token_hash === "string" ? query.token_hash : "";
  const type = typeof query.type === "string" ? query.type : "signup";
  const next = safeLocalPath(typeof query.next === "string" ? query.next : "/login", "/login");
  const text = copy[type] ?? fallbackCopy;

  return (
    <main className="site-shell-narrow flex min-h-[70vh] items-center justify-center py-20">
      <Card className="w-full max-w-xl rounded-[34px]">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          {text.kicker}
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-[color:var(--navy)]">{text.title}</h1>
        {tokenHash ? (
          <>
            <p className="mt-4 text-sm leading-7 text-[color:var(--text-soft)]">{text.body}</p>
            <form action="/auth/confirm" method="post" className="mt-8">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next} />
              <SubmitButton type="submit" className="w-full justify-center">
                {text.button}
              </SubmitButton>
            </form>
          </>
        ) : (
          <p className="mt-4 text-sm leading-7 text-[color:var(--text-soft)]">
            This link is incomplete. Please open the most recent email we sent you, or ask the
            NZ Esports team for a new link.
          </p>
        )}
      </Card>
    </main>
  );
}
