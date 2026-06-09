import type { ReactNode } from "react";
import { Clock3, MonitorPlay, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";

import { BookPresentationButton } from "@/components/site/book-presentation-button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPresentationBySlug } from "@/lib/services/presentations";

export default async function PresentationDetailPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const presentation = await getPresentationBySlug(slug);

  if (!presentation) {
    notFound();
  }

  return (
    <main className="site-shell-wide py-10">
      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Card className="rounded-[38px]">
          <span className="section-kicker">{presentation.yearLevels}</span>
          <h1 className="mt-6 text-5xl font-semibold tracking-[-0.06em] text-[color:var(--navy)] md:text-6xl">
            {presentation.title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-[color:var(--text-soft)]">
            {presentation.fullDescription}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <DetailStat
              icon={<Clock3 className="h-4 w-4" />}
              label="Duration"
              value={`${presentation.durationMinutes} mins`}
            />
            <DetailStat
              icon={<MonitorPlay className="h-4 w-4" />}
              label="Formats"
              value={presentation.deliveryFormats.join(", ")}
            />
            <DetailStat
              icon={<UsersRound className="h-4 w-4" />}
              label="Audience"
              value={presentation.yearLevels}
            />
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="rounded-[28px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)] p-6 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                Learning outcomes
              </h2>
              <ul className="mt-4 grid gap-3 text-sm leading-7 text-[color:var(--text-soft)]">
                {presentation.learningOutcomes.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-[28px] bg-[linear-gradient(135deg,#f7fdf8,#f9fcff)] p-6 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                Required equipment
              </h2>
              <ul className="mt-4 grid gap-3 text-sm leading-7 text-[color:var(--text-soft)]">
                {presentation.requiredEquipment.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card className="rounded-[38px] bg-[linear-gradient(135deg,rgba(4,15,75,0.98),rgba(11,127,74,0.9))] text-white">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/72">
              Delivery details
            </p>
            <div className="mt-6 grid gap-4 text-sm text-white/78">
              <div className="rounded-[22px] bg-white/10 px-4 py-4">
                <p className="font-semibold text-white">Visibility</p>
                <p>{presentation.public ? "Publicly bookable" : "Internal only"}</p>
              </div>
              <div className="rounded-[22px] bg-white/10 px-4 py-4">
                <p className="font-semibold text-white">Operational model</p>
                <p>Every request starts tentative and is confirmed by staff.</p>
              </div>
              <div className="rounded-[22px] bg-white/10 px-4 py-4">
                <p className="font-semibold text-white">Best fit</p>
                <p>Assemblies, classroom sessions, pathway events, and targeted workshops.</p>
              </div>
            </div>
            <div className="mt-8 grid gap-3">
              <BookPresentationButton presentationSlug={presentation.slug}>
                Request this presentation
              </BookPresentationButton>
              <ButtonLink href="/presentations" variant="secondary" className="text-white">
                Back to all presentations
              </ButtonLink>
            </div>
          </Card>

          <Card className="rounded-[34px]">
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
