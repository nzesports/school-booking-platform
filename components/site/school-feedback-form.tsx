import {
  CalendarClock,
  CalendarDays,
  Check,
  MessageSquare,
  MessageSquarePlus,
  Send,
  UserRound,
  UsersRound,
  Zap
} from "lucide-react";
import type { ReactNode } from "react";

import { StarRatingInput } from "@/components/site/star-rating-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatShortDate, formatTime } from "@/lib/utils";

// The post-session feedback form, shared between the school portal
// (/school/review/[sessionId]) and the public email link (/feedback/[sessionId]).
export function SchoolFeedbackForm({
  action,
  sessionId,
  returnTo,
  schoolName,
  defaultName,
  presentationTitle,
  startsAt,
  ambassadorName
}: {
  action: (formData: FormData) => void | Promise<void>;
  sessionId: string;
  returnTo: string;
  schoolName: string;
  defaultName?: string;
  presentationTitle?: string;
  startsAt?: string;
  ambassadorName?: string;
}) {
  return (
    <div className="grid gap-5">
      <Card
        className="overflow-hidden rounded-[28px] p-0"
        style={{ borderLeft: "5px solid var(--green)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-5 px-6 py-5 md:px-7">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[color:var(--green)]">
              School presentation feedback
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              {presentationTitle ?? "Post-session feedback"}
            </h2>
            {startsAt ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-[color:var(--text-soft)]">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-[color:var(--navy)]/70" />
                  Delivered {formatShortDate(startsAt)}
                </span>
                <span className="inline-flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-[color:var(--navy)]/70" />
                  {formatTime(startsAt)}
                </span>
                {ambassadorName ? (
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-[color:var(--navy)]/70" />
                    Presented by {ambassadorName}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px] bg-[color:var(--green-soft)] text-[color:var(--green)]">
            <MessageSquarePlus className="h-10 w-10" />
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden rounded-[28px] p-0">
        <form action={action} className="grid">
          <input type="hidden" name="bookingSessionId" value={sessionId} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <FeedbackSection step={1} title="About you">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[color:var(--navy)]">
                  Your name and role
                </span>
                <Input
                  name="attribution"
                  defaultValue={defaultName}
                  placeholder="e.g. Jordan Smith, Deputy Principal"
                  required
                />
              </label>
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-[color:var(--navy)]">School</span>
                <p className="flex min-h-[48px] items-center rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 text-sm text-[color:var(--navy)]">
                  {schoolName}
                </p>
              </div>
            </div>
          </FeedbackSection>

          <FeedbackSection step={2} title="Quick questions">
            <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-[color:var(--border-soft)]">
              <div className="grid gap-3 lg:pr-7">
                <p className="text-sm font-semibold text-[color:var(--navy)]">
                  Did the students compete in an esports event?
                </p>
                <YesNoField name="studentsCompeted" />
              </div>
              <label className="grid gap-3 lg:pl-7">
                <span className="text-sm font-semibold text-[color:var(--navy)]">
                  Did you hear any feedback from attendees?
                </span>
                <Textarea
                  name="attendeeFeedback"
                  maxLength={500}
                  placeholder="If so, share it here."
                  className="min-h-24"
                  required
                />
              </label>
            </div>
          </FeedbackSection>

          <FeedbackSection
            step={3}
            title="Rate the presentation"
            hint="Rate each area from 1 (poor) to 5 (excellent)."
          >
            <RatingGrid />
          </FeedbackSection>

          <FeedbackSection
            step={4}
            title="Presentation feedback"
            hint="Do you have any feedback you'd like us to consider for future presentations?"
          >
            <Textarea
              name="quote"
              maxLength={1000}
              placeholder="What worked well, and what should we improve next time?"
              className="min-h-28"
              required
            />
          </FeedbackSection>

          <FeedbackSection step={5} title="School esports interest">
            <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-[color:var(--border-soft)]">
              <div className="grid gap-3 lg:pr-7">
                <p className="text-sm font-semibold text-[color:var(--navy)]">
                  Did you have a school esports club prior to the presentation?
                </p>
                <YesNoField name="hadEsportsClub" />
              </div>
              <div className="grid gap-3 lg:pl-7">
                <p className="text-sm font-semibold text-[color:var(--navy)]">
                  Are you considering starting an esports club now?
                </p>
                <YesNoField name="consideringClub" />
              </div>
            </div>
          </FeedbackSection>

          <FeedbackSection step={6} title="Stay connected" className="border-b-0">
            <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-[color:var(--border-soft)]">
              <div className="grid gap-3 lg:pr-7">
                <p className="text-sm font-semibold text-[color:var(--navy)]">
                  Would you like us to add you to our mailing list?
                </p>
                <YesNoField name="mailingListOptIn" />
              </div>
              <label className="flex items-center gap-3 text-sm font-medium text-[color:var(--navy)] lg:pl-7">
                <input
                  type="checkbox"
                  name="isPublic"
                  defaultChecked
                  required
                  className="h-5 w-5 rounded border-[color:var(--border-soft)] accent-[color:var(--green)]"
                />
                Staff can consider this for public testimonials after review.
              </label>
            </div>
          </FeedbackSection>

          <div className="flex justify-end border-t border-[color:var(--border-soft)] bg-[rgba(248,252,255,0.78)] px-6 py-5 md:px-7">
            <Button
              type="submit"
              className="min-h-[48px] rounded-[14px] border-[#149238] bg-[color:var(--green)] px-6 text-white hover:border-[#0f7c2e] hover:bg-[#128a30]"
            >
              <Send className="h-4 w-4" />
              Submit feedback
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function FeedbackSection({
  step,
  title,
  hint,
  children,
  className
}: {
  step: number;
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-b border-[color:var(--border-soft)] px-6 py-5 md:px-7",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--green)] text-sm font-bold text-white shadow-[0_10px_22px_rgba(24,168,59,0.2)]">
          {step}
        </span>
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
            {title}
          </h3>
          {hint ? <p className="mt-1 text-sm text-[color:var(--text-soft)]">{hint}</p> : null}
        </div>
      </div>
      <div className="mt-5 pl-0 md:pl-11">{children}</div>
    </section>
  );
}

function YesNoField({ name }: { name: string }) {
  return (
    <div className="grid max-w-[520px] grid-cols-2 gap-1 rounded-[18px] border border-[color:var(--border-soft)] bg-[#f8fbff] p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]">
      {["yes", "no"].map((value, index) => (
        <label key={value} className="cursor-pointer">
          <input type="radio" name={name} value={value} required className="peer sr-only" />
          <span
            className={cn(
              "flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] text-sm font-semibold text-[color:var(--navy)] transition peer-focus-visible:ring-4 peer-focus-visible:ring-[rgba(24,168,59,0.16)] peer-checked:bg-[rgba(24,168,59,0.12)] peer-checked:text-[color:var(--green)] peer-checked:shadow-[inset_0_0_0_1px_rgba(24,168,59,0.24),0_8px_20px_rgba(24,168,59,0.08)] peer-checked:[&_.yes-no-check]:opacity-100",
              index === 0 ? "border-r border-transparent" : ""
            )}
          >
            <Check className="yes-no-check h-4 w-4 opacity-0 transition" />
            {value === "yes" ? "Yes" : "No"}
          </span>
        </label>
      ))}
    </div>
  );
}

function RatingGrid() {
  const rows = [
    {
      name: "attendanceRating",
      label: "Attendance",
      icon: <UsersRound className="h-4 w-4" />,
      iconClassName: "bg-[#e8f1fd] text-[#1e4fae]"
    },
    {
      name: "studentResponseRating",
      label: "Student response",
      icon: <UserRound className="h-4 w-4" />,
      iconClassName: "bg-[#e6f5ec] text-[#117a2e]"
    },
    {
      name: "contentRating",
      label: "Content",
      icon: <MessageSquare className="h-4 w-4" />,
      iconClassName: "bg-[#f0e7ff] text-[#7a4fd8]"
    },
    {
      name: "presenterEnergyRating",
      label: "Presenter energy",
      icon: <Zap className="h-4 w-4" />,
      iconClassName: "bg-[#fff4dd] text-[#d18616]"
    }
  ];

  return (
    <div className="grid divide-y divide-[color:var(--border-soft)]">
      {rows.map((row) => (
        <RatingRow
          key={row.name}
          name={row.name}
          label={row.label}
          icon={row.icon}
          iconClassName={row.iconClassName}
        />
      ))}
    </div>
  );
}

function RatingRow({
  name,
  label,
  icon,
  iconClassName
}: {
  name: string;
  label: string;
  icon: ReactNode;
  iconClassName: string;
}) {
  return (
    <div className="grid gap-3 py-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-center md:gap-4">
      <p className="flex items-center gap-3 text-sm font-medium text-[color:var(--navy)]">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            iconClassName
          )}
        >
          {icon}
        </span>
        {label}
      </p>
      <StarRatingInput name={name} label={label} />
    </div>
  );
}
