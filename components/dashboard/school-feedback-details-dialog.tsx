"use client";

import {
  CalendarDays,
  Eye,
  Globe2,
  MessageSquareQuote,
  School2,
  Star,
  UserRound
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { FeedbackDialogNavigation } from "@/components/dashboard/feedback-dialog-navigation";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import type { SchoolFeedbackSummary } from "@/lib/domain/types";
import { cn, formatShortDate } from "@/lib/utils";

const RATING_ROWS = [
  { key: "attendanceRating", label: "Attendance" },
  { key: "studentResponseRating", label: "Student response" },
  { key: "contentRating", label: "Content" },
  { key: "presenterEnergyRating", label: "Presenter energy" }
] as const;

const ANSWER_ROWS = [
  { key: "studentsCompeted", label: "Students competed in an esports event" },
  { key: "hadEsportsClub", label: "Had an esports club before the visit" },
  { key: "consideringClub", label: "Considering starting an esports club" },
  { key: "mailingListOptIn", label: "Joined the mailing list" }
] as const;

function cleanReviewText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function SchoolFeedbackDetailsButton({
  review: initialReview,
  reviews,
  className,
  label = "View",
  footer
}: {
  review: SchoolFeedbackSummary;
  reviews?: SchoolFeedbackSummary[];
  className?: string;
  label?: string;
  footer?: ReactNode | ((review: SchoolFeedbackSummary) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState(initialReview.id);
  const navigationAnchorRef = useRef<HTMLDivElement>(null);
  const reviewCollection = reviews?.length ? reviews : [initialReview];
  const matchedReviewIndex = reviewCollection.findIndex((item) => item.id === activeReviewId);
  const reviewIndex = matchedReviewIndex >= 0 ? matchedReviewIndex : 0;
  const review = reviewCollection[reviewIndex] ?? initialReview;
  const details = review.details;
  const renderedFooter = typeof footer === "function" ? footer(review) : footer;

  const showReview = (index: number) => {
    const nextReview = reviewCollection[index];

    if (!nextReview) {
      return;
    }

    setActiveReviewId(nextReview.id);
    navigationAnchorRef.current
      ?.closest('[role="dialog"]')
      ?.parentElement?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setActiveReviewId(initialReview.id);
          setOpen(true);
        }}
        className={className ?? "min-h-[36px] rounded-[14px] px-3 py-1.5 text-xs"}
      >
        <Eye className="h-3.5 w-3.5" />
        {label}
      </Button>

      {/* Portalled to <body> so glassy card ancestors (backdrop-filter) can't
          trap the fixed overlay inside their own bounds. */}
      {open
        ? createPortal(
            <BookingDialogShell
              kicker="School feedback"
              title={review.schoolName}
              description={`${review.presentationTitle} · submitted ${formatShortDate(review.createdAt)}`}
              onClose={() => setOpen(false)}
              maxWidthClassName="max-w-[720px]"
              overlayClassName="z-[80]"
              compact
            >
              <div ref={navigationAnchorRef} className="h-0" />
              <FeedbackDialogNavigation
                current={reviewIndex + 1}
                total={reviewCollection.length}
                onPrevious={reviewIndex > 0 ? () => showReview(reviewIndex - 1) : undefined}
                onNext={
                  reviewIndex < reviewCollection.length - 1
                    ? () => showReview(reviewIndex + 1)
                    : undefined
                }
                className="mt-5"
              />
              <div className="mt-5 grid gap-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoTile
                    icon={<School2 className="h-4 w-4" />}
                    label="School"
                    value={review.schoolName}
                  />
                  <InfoTile
                    icon={<UserRound className="h-4 w-4" />}
                    label="Submitted by"
                    value={review.attribution ?? "School contact"}
                  />
                  <InfoTile
                    icon={<CalendarDays className="h-4 w-4" />}
                    label="Submitted"
                    value={formatShortDate(review.createdAt)}
                  />
                </div>

                <div className="rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[color:var(--navy)]">Ratings</p>
                    {typeof review.rating === "number" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5df] px-3 py-1 text-sm font-semibold text-[#b7791f]">
                        <Star className="h-4 w-4 fill-[#f4b63f] text-[#f4b63f]" />
                        {review.rating}/5 overall
                      </span>
                    ) : null}
                  </div>
                  {details ? (
                    <div className="mt-3 grid gap-2.5">
                      {RATING_ROWS.map((row) => {
                        const value = details[row.key];

                        return (
                          <div
                            key={row.key}
                            className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] items-center gap-3"
                          >
                            <span className="text-sm text-[color:var(--text-soft)]">
                              {row.label}
                            </span>
                            <span className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={cn(
                                    "h-4 w-4",
                                    typeof value === "number" && star <= value
                                      ? "fill-[#f4b63f] text-[#f4b63f]"
                                      : "fill-transparent text-[#d7dee9]"
                                  )}
                                />
                              ))}
                              <span className="ml-1.5 text-sm font-semibold text-[color:var(--navy)]">
                                {typeof value === "number" ? `${value}/5` : "—"}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[color:var(--text-soft)]">
                      This review was submitted before per-category ratings were collected.
                    </p>
                  )}
                </div>

                {details ? (
                  <div className="rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 p-4">
                    <p className="text-sm font-semibold text-[color:var(--navy)]">
                      Quick answers
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {ANSWER_ROWS.map((row) => {
                        const value = details[row.key];

                        return (
                          <div
                            key={row.key}
                            className="flex items-center justify-between gap-3 rounded-[13px] bg-[#f6f9fd] px-3.5 py-2.5"
                          >
                            <span className="text-sm text-[color:var(--navy)]">{row.label}</span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase",
                                value === "yes"
                                  ? "bg-[#eaf8ee] text-[#117a2e]"
                                  : "bg-[#f1f5f9] text-[#64748b]"
                              )}
                            >
                              {value === "yes" ? "Yes" : value === "no" ? "No" : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {details?.attendeeFeedback ? (
                  <div className="rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 p-4">
                    <p className="text-sm font-semibold text-[color:var(--navy)]">
                      Feedback heard from attendees
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
                      {cleanReviewText(details.attendeeFeedback)}
                    </p>
                  </div>
                ) : null}

                <div className="rounded-[18px] border border-[#f0d8a8] bg-[#fffaf0] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#9a5a00]">
                    <MessageSquareQuote className="h-4 w-4" />
                    Written review
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--navy)]">
                    &ldquo;{cleanReviewText(review.quote)}&rdquo;
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-[#f6f9fd] px-4 py-3.5">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--navy)]">
                    <Globe2 className="h-4 w-4 text-[color:var(--text-soft)]" />
                    {review.isApproved && review.isPublic
                      ? "This review is live on the website."
                      : "This review is not shown on the website."}
                  </p>
                  {renderedFooter}
                </div>
              </div>
            </BookingDialogShell>,
            document.body
          )
        : null}
    </>
  );
}

function InfoTile({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--text-soft)]">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-[color:var(--navy)]">{value}</p>
    </div>
  );
}
