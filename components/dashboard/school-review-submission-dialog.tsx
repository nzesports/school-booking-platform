"use client";

import { CalendarDays, CheckCircle2, Eye, MessageSquare, Star, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import type { SchoolFeedbackSummary } from "@/lib/domain/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

type SchoolReviewSubmissionButtonProps = {
  review: SchoolFeedbackSummary;
  session?: {
    startsAt: string;
    ambassadorName?: string | null;
  };
  className?: string;
};

function formatNzDate(iso?: string, withTime = false) {
  if (!iso) {
    return "Not recorded";
  }

  return withTime ? formatDateTime(iso) : formatDate(iso);
}

function displayAnswer(value?: string) {
  if (!value) {
    return "Not recorded";
  }

  if (value === "yes") {
    return "Yes";
  }

  if (value === "no") {
    return "No";
  }

  return value;
}

export function SchoolReviewSubmissionButton({
  review,
  session,
  className
}: SchoolReviewSubmissionButtonProps) {
  const [open, setOpen] = useState(false);
  const details = review.details;
  const ratings = [
    ["Attendance", details?.attendanceRating],
    ["Student response", details?.studentResponseRating],
    ["Content", details?.contentRating],
    ["Presenter energy", details?.presenterEnergyRating]
  ] as const;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className={className ?? "min-h-[42px] rounded-[13px] px-4 text-[13px]"}
      >
        <Eye className="h-3.5 w-3.5" />
        View submission
      </Button>

      {open
        ? createPortal(
            <BookingDialogShell
              title={review.presentationTitle}
              onClose={() => setOpen(false)}
              maxWidthClassName="max-w-[820px]"
              overlayClassName="z-[80]"
              compact
            >
              <div className="mt-4 grid gap-3 rounded-[24px] border border-[#c9ead1] bg-[linear-gradient(135deg,#fbfffc,#f8fcff)] p-4 md:grid-cols-3">
                <SubmissionTile icon={<CalendarDays className="h-4 w-4" />} label="Session">
                  {session ? formatNzDate(session.startsAt, true) : formatNzDate(review.createdAt)}
                </SubmissionTile>
                <SubmissionTile icon={<UserRound className="h-4 w-4" />} label="Presenter">
                  {session?.ambassadorName ?? "Not recorded"}
                </SubmissionTile>
                <SubmissionTile icon={<Star className="h-4 w-4" />} label="Overall rating">
                  {review.rating ? `${review.rating} / 5` : "Not recorded"}
                </SubmissionTile>
              </div>

              <section className="mt-5 rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--green)]">
                  <MessageSquare className="h-4 w-4" />
                  Written feedback
                </p>
                <p className="mt-3 text-base italic leading-8 text-[color:var(--navy)]">
                  &ldquo;{review.quote}&rdquo;
                </p>
                <div className="mt-3 grid gap-2">
                  <ReadOnlyRow label="Submitted by"
                    value={details?.firstName && details?.lastName ? `${details.firstName} ${details.lastName}` : review.attribution ?? "School contact"} />
                  <ReadOnlyRow label="Role at school" value={details?.role ?? "Not recorded"} />
                </div>
              </section>

              <section className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <h3 className="text-lg font-semibold text-[color:var(--navy)]">
                    Quick questions
                  </h3>
                  <div className="mt-4 grid gap-3">
                    <ReadOnlyRow
                      label="Students attended (school-reported)"
                      value={details?.studentsAttended == null ? "Not recorded" : String(details.studentsAttended)}
                    />
                    <ReadOnlyRow
                      label="Students competed in an esports event"
                      value={displayAnswer(details?.studentsCompeted)}
                    />
                    <ReadOnlyRow
                      label="School had an esports club"
                      value={displayAnswer(details?.hadEsportsClub)}
                    />
                    <ReadOnlyRow
                      label="Considering starting an esports club"
                      value={displayAnswer(details?.consideringClub)}
                    />
                    <ReadOnlyRow
                      label="Mailing list opt-in"
                      value={displayAnswer(details?.mailingListOptIn)}
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <h3 className="text-lg font-semibold text-[color:var(--navy)]">
                    Presentation ratings
                  </h3>
                  <div className="mt-4 grid gap-3">
                    {ratings.map(([label, value]) => (
                      <ReadOnlyRow
                        key={label}
                        label={label}
                        value={value ? `${value} / 5` : "Not recorded"}
                      />
                    ))}
                  </div>
                </div>
              </section>

              {details?.attendeeFeedback ? (
                <section className="mt-5 rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <h3 className="text-lg font-semibold text-[color:var(--navy)]">
                    Feedback from attendees
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                    {details.attendeeFeedback}
                  </p>
                </section>
              ) : null}

              <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#eaf8ee] px-4 py-2 text-sm font-semibold text-[#117a2e]">
                <CheckCircle2 className="h-4 w-4" />
                Read-only submission
              </p>
            </BookingDialogShell>,
            document.body
          )
        : null}
    </>
  );
}

function SubmissionTile({
  icon,
  label,
  children
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[18px] bg-white/82 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        <span className="text-[color:var(--green)]">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[color:var(--navy)]">{children}</p>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[16px] bg-[#f8fbff] px-3 py-2.5">
      <span className="text-sm text-[color:var(--text-soft)]">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words text-right text-sm font-semibold",
          value === "Not recorded" ? "text-[color:var(--text-soft)]" : "text-[color:var(--navy)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}
