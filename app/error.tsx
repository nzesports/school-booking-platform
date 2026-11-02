"use client";

import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Replaces Next's bare "This page couldn't load" screen with a branded page
// that keeps people inside the portal. The digest matches the server log.
export default function Error({
  error,
  retry
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="site-shell-narrow flex min-h-[60vh] items-center justify-center py-20">
      <Card className="max-w-xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Something went wrong
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-[color:var(--navy)]">
          This page couldn&apos;t load.
        </h1>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
          Try again in a moment. If it keeps happening, let the team know
          {error.digest ? ` and quote reference ${error.digest}` : ""}.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <ButtonLink href="/" variant="secondary">
            Back to homepage
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
