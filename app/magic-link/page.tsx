import { requestMagicLinkAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function MagicLinkPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const sent = typeof query.sent === "string" ? query.sent : null;

  return (
    <main className="site-shell-narrow flex min-h-[65vh] items-center justify-center py-20">
      <Card className="w-full max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Magic link access
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-[color:var(--navy)]">
          Email a secure booking access link.
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
          School contacts can use magic-link access even before they convert to full accounts.
        </p>
        <form action={requestMagicLinkAction} className="mt-8 grid gap-4">
          <Input name="email" type="email" placeholder="teacher@school.nz" required />
          <Button type="submit" className="w-full justify-center">
            Send magic link
          </Button>
        </form>
        {sent ? (
          <p className="mt-4 rounded-2xl bg-[color:var(--green-soft)] px-4 py-3 text-sm text-[color:var(--green)]">
            Demo link request recorded for {sent}
          </p>
        ) : null}
      </Card>
    </main>
  );
}
