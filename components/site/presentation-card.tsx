import Link from "next/link";
import {
  BriefcaseBusiness,
  Clock3,
  Gamepad2,
  HeartHandshake,
  UsersRound
} from "lucide-react";

import { BookPresentationButton } from "@/components/site/book-presentation-button";
import { Card } from "@/components/ui/card";
import type { PresentationType } from "@/lib/domain/types";

export function PresentationCard({ presentation }: { presentation: PresentationType }) {
  const Icon = iconMap[presentation.slug] ?? UsersRound;
  const yearGroupClass = yearGroupStyles[presentation.yearLevels] ?? yearGroupStyles.default;

  return (
    <Card className="group flex h-full flex-col rounded-[30px] p-6 transition hover:-translate-y-1">
      <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#f7fbff,#edf6ff)] text-[color:var(--green)] shadow-[inset_0_0_0_1px_rgba(4,15,75,0.06)]">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-[26px] font-semibold leading-8 tracking-[-0.04em] text-[color:var(--navy)]">
        {presentation.title}
      </h3>
      <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">
        {presentation.shortSummary}
      </p>
      <div className="mt-auto pt-8">
        <div className="flex flex-wrap gap-3 pb-6 text-sm text-[color:var(--text-soft)]">
          <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--blue-soft)] px-3 py-1.5">
            <Clock3 className="h-4 w-4" />
            {presentation.durationMinutes} mins
          </span>
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${yearGroupClass}`}>
            {presentation.yearLevels}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-[color:var(--border-soft)] pt-6">
          <Link
            href={`/presentations/${presentation.slug}`}
            className="text-sm font-semibold text-[color:var(--navy)]"
          >
            Learn more
          </Link>

          <BookPresentationButton
            presentationSlug={presentation.slug}
            className="min-h-[48px] rounded-[20px] px-5 py-2.5 text-sm"
          >
            Book now
          </BookPresentationButton>
        </div>
      </div>
    </Card>
  );
}

const iconMap: Record<string, typeof HeartHandshake> = {
  careers: BriefcaseBusiness,
  "digital-wellbeing": HeartHandshake,
  "esports-pathways": Gamepad2,
  "understanding-esports": UsersRound
};

const yearGroupStyles: Record<string, string> = {
  "Years 1 to 6": "bg-[#fff3d8] text-[#9a6900]",
  "Years 7 to 8": "bg-[#e6f5ee] text-[#178247]",
  "Years 9 to 13": "bg-[#ecebff] text-[#4a43a9]",
  default: "bg-[color:var(--green-soft)] text-[color:var(--green)]"
};
