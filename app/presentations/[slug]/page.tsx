import type { ReactNode } from "react";
import { CircleCheck, Clock3, MonitorPlay, Projector, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";

import { HeroBookingWidget } from "@/components/site/hero-booking-widget";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { splitYearGroups, yearGroupChipClass } from "@/lib/domain/year-groups";
import { loadAvailabilityConfig } from "@/lib/services/availability-server";
import {
  getPresentationBySlug,
  listPublicPresentations,
  listRegions
} from "@/lib/services/presentations";
import { sanitizeRichText } from "@/lib/services/sanitize";
import { toYouTubeEmbedUrl } from "@/lib/utils";

export default async function PresentationDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [presentation, presentations, regions, availabilityConfig] = await Promise.all([
    getPresentationBySlug(slug),
    listPublicPresentations(),
    listRegions(),
    loadAvailabilityConfig()
  ]);

  if (!presentation) {
    notFound();
  }

  const yearGroups = splitYearGroups(presentation.yearLevels);
  const videoEmbedUrl = toYouTubeEmbedUrl(presentation.youtubeUrl);

  return (
    <main className="site-shell-wide py-8 md:py-10">
      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Card className="rounded-[30px] md:rounded-[38px]">
          <div className="flex flex-wrap gap-2">
            {yearGroups.map((group) => (
              <span
                key={group}
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold ${yearGroupChipClass(group)}`}
              >
                {group}
              </span>
            ))}
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.06em] text-[color:var(--navy)] md:text-6xl">
            {presentation.title}
          </h1>
          <div
            className="rich-text-prose mt-5 max-w-3xl text-base leading-8 text-[color:var(--text-soft)] md:text-lg"
            dangerouslySetInnerHTML={{
              __html: sanitizeRichText(presentation.fullDescription)
            }}
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <DetailStat
              icon={<Clock3 className="h-4 w-4" />}
              label="Duration"
              value={`${presentation.durationMinutes} mins`}
            />
            <DetailStat
              icon={<MonitorPlay className="h-4 w-4" />}
              label="Formats"
              value={presentation.deliveryFormats.join(", ") || "Assembly"}
            />
            <DetailStat
              icon={<UsersRound className="h-4 w-4" />}
              label="Audience"
              value={yearGroups.join(", ")}
            />
          </div>

          {videoEmbedUrl ? (
            <div className="mt-8">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                Watch a preview
              </h2>
              <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
                See what this presentation looks like in action before you book.
              </p>
              <div className="mt-4 overflow-hidden rounded-[24px] border border-[color:var(--border-soft)] shadow-[0_18px_44px_rgba(11,24,77,0.12)]">
                <iframe
                  src={videoEmbedUrl}
                  title={`${presentation.title} — video preview`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="aspect-video w-full"
                />
              </div>
            </div>
          ) : null}

          {presentation.learningOutcomes.length > 0 || presentation.requiredEquipment.length > 0 ? (
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {presentation.learningOutcomes.length > 0 ? (
                <div className="rounded-[28px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)] p-6 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]">
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                    Learning outcomes
                  </h2>
                  <ul className="mt-4 grid gap-3 text-sm leading-7 text-[color:var(--text-soft)]">
                    {presentation.learningOutcomes.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-[color:var(--green)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {presentation.requiredEquipment.length > 0 ? (
                <div className="rounded-[28px] bg-[linear-gradient(135deg,#f7fdf8,#f9fcff)] p-6 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]">
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                    Required equipment
                  </h2>
                  <ul className="mt-4 grid gap-3 text-sm leading-7 text-[color:var(--text-soft)]">
                    {presentation.requiredEquipment.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <Projector className="mt-1 h-4 w-4 shrink-0 text-[color:var(--navy)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        <div className="grid content-start gap-6">
          <HeroBookingWidget
            presentations={presentations}
            regions={regions}
            availabilityConfig={availabilityConfig}
            initialPresentationSlug={presentation.slug}
            mode="compact"
          />

          <Card className="rounded-[30px] md:rounded-[34px]">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Need help choosing?
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
              We can help shape the right session mix.
            </p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
              Many schools combine wellbeing, pathways, and introductory esports content into
              one visit. Use the booking flow to request multiple sessions together.
            </p>
            <ButtonLink
              href="/presentations"
              variant="secondary"
              className="mt-5 w-full justify-center"
            >
              Back to all presentations
            </ButtonLink>
          </Card>
        </div>
      </div>
    </main>
  );
}

function DetailStat({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]">
      <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text-soft)]">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {value}
      </p>
    </div>
  );
}
