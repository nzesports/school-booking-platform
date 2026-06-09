import { ArrowRight, Layers3, ShieldCheck } from "lucide-react";

import { submitBookingRequestAction } from "@/app/actions";
import { BookingRequestForm } from "@/components/forms/booking-request-form";
import { ButtonLink } from "@/components/ui/button";
import { listPublicPresentations, listRegions } from "@/lib/services/presentations";

export default async function BookPage({
  params,
  searchParams
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query, presentations, regions] = await Promise.all([
    params,
    searchParams,
    listPublicPresentations(),
    listRegions()
  ]);

  const selectedPresentationSlug = slug?.[0];
  const initialRegionSlug = typeof query.region === "string" ? query.region : undefined;
  const initialDate = typeof query.date === "string" ? query.date : undefined;
  const initialTime = typeof query.time === "string" ? query.time : undefined;

  return (
    <main className="public-stack pb-24 pt-8">
      <section className="public-band public-band-soft public-band-divider">
        <div className="site-shell grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Tentative booking request
            </p>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.06em] text-[color:var(--navy)] md:text-6xl">
              Build a school request with one or more sessions.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[color:var(--text-soft)]">
              Start with the presentations you want, then share your preferred timing and
              school contact details. Our team confirms availability before anything is
              locked in.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/65 bg-white/70 px-4 py-3 text-sm text-[color:var(--navy)] shadow-[0_10px_22px_rgba(11,24,77,0.06)]">
                <Layers3 className="h-4 w-4 text-[color:var(--green)]" />
                Multi-session requests stay grouped together for school visits.
              </div>
              <div className="inline-flex items-center gap-3 rounded-full border border-white/65 bg-white/70 px-4 py-3 text-sm text-[color:var(--navy)] shadow-[0_10px_22px_rgba(11,24,77,0.06)]">
                <ShieldCheck className="h-4 w-4 text-[color:var(--green)]" />
                Staff review availability, assignment, and privacy before confirmation.
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-[rgba(4,15,75,0.08)] bg-white/78 p-6 shadow-[0_18px_42px_rgba(11,24,77,0.08)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Booking flow
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
              Choose your sessions, then confirm the school details.
            </p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
              If you already selected a topic from the homepage or presentation detail view,
              we’ve pre-filled that choice here to save time.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink
                href="/presentations"
                variant="secondary"
                className="min-h-[46px] rounded-[16px] px-5 py-2.5"
              >
                Browse presentation topics
              </ButtonLink>
              <ButtonLink
                href="/school"
                variant="ghost"
                className="min-h-[46px] rounded-[16px] border border-[rgba(4,15,75,0.08)] bg-white/65 px-5 py-2.5"
              >
                View school portal
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section className="public-band public-band-compact">
        <div className="site-shell">
          <BookingRequestForm
            presentations={presentations}
            regions={regions}
            initialPresentationSlug={selectedPresentationSlug}
            initialRegionSlug={initialRegionSlug}
            initialDate={initialDate}
            initialTime={initialTime}
            action={submitBookingRequestAction}
          />
        </div>
      </section>
    </main>
  );
}
