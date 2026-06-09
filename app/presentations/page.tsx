import { ArrowRight, Sparkles } from "lucide-react";

import { PresentationCard } from "@/components/site/presentation-card";
import { ButtonLink } from "@/components/ui/button";
import { listPublicPresentations } from "@/lib/services/presentations";

export default async function PresentationsPage() {
  const presentations = await listPublicPresentations();

  return (
    <main className="public-stack pb-24 pt-8">
      <section className="public-band public-band-soft public-band-divider">
        <div className="site-shell grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
          <div className="max-w-4xl">
            <span className="section-kicker">
              <Sparkles className="h-3.5 w-3.5" />
              Presentation library
            </span>
            <h1 className="mt-6 text-5xl font-semibold tracking-[-0.06em] text-[color:var(--navy)] md:text-6xl">
              Flexible topics schools can book with confidence.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[color:var(--text-soft)]">
              Browse the full NZ Esports presentation catalogue, compare delivery formats,
              and move straight into the booking flow once you find the right fit for your
              students.
            </p>
          </div>

          <div className="rounded-[28px] border border-[rgba(4,15,75,0.08)] bg-white/78 p-6 shadow-[0_18px_42px_rgba(11,24,77,0.08)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Quick start
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
              Ready to secure a date?
            </p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
              Choose a topic, then head into the multi-session booking flow for dates,
              timing, contact details, and operational notes.
            </p>
            <ButtonLink
              href="/book"
              className="mt-6 min-h-[46px] rounded-[16px] px-5 py-2.5"
            >
              Start a booking
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="public-band public-band-compact">
        <div className="site-shell">
          <div className="grid gap-5 xl:grid-cols-4">
            {presentations.map((presentation) => (
              <PresentationCard key={presentation.id} presentation={presentation} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
