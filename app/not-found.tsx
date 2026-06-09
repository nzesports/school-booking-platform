import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="site-shell-narrow flex min-h-[60vh] items-center justify-center py-20">
      <Card className="max-w-xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Not found
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-[color:var(--navy)]">
          We couldn&apos;t find that view.
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
          The route scaffold is in place, but this specific page doesn&apos;t have content yet.
        </p>
        <div className="mt-6">
          <ButtonLink href="/">Back to homepage</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
