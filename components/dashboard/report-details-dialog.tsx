"use client";

import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Eye,
  ExternalLink,
  FileText,
  Flag,
  GraduationCap,
  HeartHandshake,
  HelpCircle,
  Info,
  MessageSquareText,
  Phone,
  Play,
  Quote,
  ShieldCheck,
  Star,
  Trophy,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { FeedbackDialogNavigation } from "@/components/dashboard/feedback-dialog-navigation";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import type { ReportSummary } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type ReportMediaItem = { id?: string; url: string; type: string; title?: string };

// Report media lives in a private bucket and is served through the
// auth-gated /portal/report-media/[mediaId] route (which also proxies
// legacy rows that still hold a public-bucket URL). Fall back to the
// stored URL only when a row has no id.
function mediaSrc(item: ReportMediaItem) {
  return item.id ? `/portal/report-media/${encodeURIComponent(item.id)}` : item.url;
}

function formatNzDate(iso?: string, withTime = false) {
  if (!iso) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
    timeZone: "Pacific/Auckland"
  }).format(new Date(iso));
}

function yesNo(value?: boolean) {
  if (value === undefined) {
    return "Not recorded";
  }

  return value ? "Yes" : "No";
}

export function ReportDetailsButton({
  report: initialReport,
  reports,
  className,
  label = "View submission",
  reviewAction,
  reviewReturnTo
}: {
  report: ReportSummary;
  reports?: ReportSummary[];
  className?: string;
  label?: string;
  reviewAction?: (formData: FormData) => void | Promise<void>;
  reviewReturnTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeReportId, setActiveReportId] = useState(initialReport.id);
  const [lightbox, setLightbox] = useState<ReportMediaItem | null>(null);
  const navigationAnchorRef = useRef<HTMLDivElement>(null);
  const reportCollection = reports?.length ? reports : [initialReport];
  const matchedReportIndex = reportCollection.findIndex((item) => item.id === activeReportId);
  const reportIndex = matchedReportIndex >= 0 ? matchedReportIndex : 0;
  const report = reportCollection[reportIndex] ?? initialReport;
  const media = report.media ?? [];

  const showReport = (index: number) => {
    const nextReport = reportCollection[index];

    if (!nextReport) {
      return;
    }

    setLightbox(null);
    setActiveReportId(nextReport.id);
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
          setActiveReportId(initialReport.id);
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
              title={`${report.presentationTitle} at ${report.schoolName}`}
              onClose={() => setOpen(false)}
              maxWidthClassName="max-w-[880px]"
              overlayClassName="z-[80]"
              compact
            >
              <div
                ref={navigationAnchorRef}
                className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[color:var(--text-soft)]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  Delivered {formatNzDate(report.deliveredAt ?? report.sessionStartsAt, true)}
                </span>
                <span className="text-[color:var(--green)]">•</span>
                <span>Submitted {formatNzDate(report.submittedAt)}</span>
                {report.ambassadorName ? (
                  <>
                    <span className="text-[color:var(--green)]">•</span>
                    <span>by {report.ambassadorName}</span>
                  </>
                ) : null}
              </div>

              <FeedbackDialogNavigation
                current={reportIndex + 1}
                total={reportCollection.length}
                onPrevious={reportIndex > 0 ? () => showReport(reportIndex - 1) : undefined}
                onNext={
                  reportIndex < reportCollection.length - 1
                    ? () => showReport(reportIndex + 1)
                    : undefined
                }
              />

              {/* -------------------------------------------- 1. overview */}
              <SectionHeading icon={<UsersRound className="h-4 w-4" />} index={1}>
                Session overview
              </SectionHeading>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <OverviewTile icon={<UserRound className="h-4 w-4" />} label="Presenter">
                  {report.presenterName ?? report.ambassadorName ?? "—"}
                </OverviewTile>
                <OverviewTile icon={<UsersRound className="h-4 w-4" />} label="Attendees">
                  {report.attendeeCount} students
                </OverviewTile>
                <OverviewTile icon={<GraduationCap className="h-4 w-4" />} label="Age groups">
                  {report.ageGroups ?? report.yearLevels ?? "Not recorded"}
                </OverviewTile>
                <OverviewTile icon={<Trophy className="h-4 w-4" />} label="Students competed in an event">
                  {yesNo(report.studentsCompetedInEsports)}
                </OverviewTile>
                <OverviewTile icon={<HeartHandshake className="h-4 w-4" />} label="Parents present">
                  {yesNo(report.parentsPresent)}
                </OverviewTile>
                <OverviewTile icon={<ShieldCheck className="h-4 w-4" />} label="Media consent">
                  {report.mediaConsentConfirmed === undefined
                    ? "Not recorded"
                    : report.mediaConsentConfirmed
                      ? "Checked / obtained"
                      : "Needs consent check"}
                </OverviewTile>
                <OverviewTile icon={<Phone className="h-4 w-4" />} label="School contact">
                  {report.primaryContactName ? (
                    <span className="grid gap-0.5">
                      <span>{report.primaryContactName}</span>
                      {report.primaryContactEmail ? (
                        <a
                          href={`mailto:${report.primaryContactEmail}`}
                          className="break-all font-semibold text-[color:var(--green)]"
                        >
                          {report.primaryContactEmail}
                        </a>
                      ) : null}
                    </span>
                  ) : (
                    "Not recorded"
                  )}
                </OverviewTile>
              </div>

              {/* -------------------------------------------- 2. ratings */}
              <SectionHeading icon={<Star className="h-4 w-4" />} index={2}>
                Ratings
              </SectionHeading>
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <RatingTile label="Attendance" value={report.attendanceRating} />
                <RatingTile label="Student response" value={report.studentEngagementRating} />
                <RatingTile label="Teacher response" value={report.teacherResponseRating} />
                <RatingTile label="Presentation energy" value={report.presentationEnergyRating} />
              </div>

              {/* -------------------------------------------- 3. media */}
              <SectionHeading icon={<MessageSquareText className="h-4 w-4" />} index={3}>
                Media &amp; evidence
                <span className="ml-1 rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-xs font-semibold normal-case tracking-normal text-[#64748b]">
                  {media.length} file{media.length === 1 ? "" : "s"}
                </span>
              </SectionHeading>
              {media.length === 0 ? (
                <p className="mt-3 rounded-[16px] border border-dashed border-[color:var(--border-soft)] bg-white/80 px-4 py-5 text-sm text-[color:var(--text-soft)]">
                  No photos, videos, or media release files were uploaded with this report.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {media.map((item, index) => (
                    <MediaTile
                      key={item.id ?? item.url}
                      item={item}
                      featured={index === 0 && media.length > 2}
                      onOpen={() => {
                        if (item.type === "document") {
                          window.open(mediaSrc(item), "_blank", "noopener,noreferrer");
                        } else {
                          setLightbox(item);
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {/* -------------------------------------------- 4. feedback */}
              <SectionHeading icon={<MessageSquareText className="h-4 w-4" />} index={4}>
                Open feedback
              </SectionHeading>
              <div className="mt-3 grid gap-3">
                <FeedbackRow icon={<Quote className="h-4 w-4" />} label="Attendee thoughts & quotes">
                  {report.attendeeQuotes?.trim() || "None recorded."}
                </FeedbackRow>
                <FeedbackRow icon={<HelpCircle className="h-4 w-4" />} label="Student questions & themes">
                  {report.notableQuestions?.trim() || "None recorded."}
                </FeedbackRow>
                <FeedbackRow
                  icon={<MessageSquareText className="h-4 w-4" />}
                  label="Presentation feedback"
                >
                  {report.presentationFeedback?.trim() || "None recorded."}
                </FeedbackRow>
                {report.additionalNotes?.trim() ? (
                  <FeedbackRow icon={<FileText className="h-4 w-4" />} label="Additional notes">
                    {report.additionalNotes}
                  </FeedbackRow>
                ) : null}
              </div>

              {/* -------------------------------------------- 5. journey */}
              <SectionHeading icon={<Flag className="h-4 w-4" />} index={5}>
                Booking journey
              </SectionHeading>
              <div className="mt-3 rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4">
                <JourneyStep
                  done
                  label="School booking requested"
                  detail={formatNzDate(report.bookingRequestedAt)}
                />
                <JourneyStep
                  done
                  label={`Ambassador allocated${report.ambassadorName ? ` — ${report.ambassadorName}` : ""}`}
                  detail={`Session scheduled ${formatNzDate(report.sessionStartsAt, true)}`}
                />
                <JourneyStep
                  done
                  label="Presentation delivered"
                  detail={formatNzDate(report.deliveredAt ?? report.sessionStartsAt, true)}
                />
                <JourneyStep
                  done
                  label="Report submitted"
                  detail={formatNzDate(report.submittedAt)}
                />
                <JourneyStep
                  done={report.status === "reviewed"}
                  label="Report approved"
                  detail={
                    report.status === "reviewed"
                      ? formatNzDate(report.reviewedAt)
                      : "Awaiting staff approval"
                  }
                  last
                />
              </div>

              {/* -------------------------------------------- footer */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-[#eef4fd] px-4 py-3">
                <p className="flex items-center gap-2.5 text-sm text-[#1e4fae]">
                  <Info className="h-4 w-4 shrink-0" />
                  Status:{" "}
                  {report.status === "reviewed"
                    ? report.paymentRequired
                      ? "Approved and prepared for finance."
                      : "Approved — no payment was required."
                    : report.paymentRequired && !report.paymentDetailsComplete
                      ? `Payment details missing: ${(report.missingPaymentDetails ?? []).join(", ")}.`
                      : "Submitted — awaiting staff approval."}
                </p>
                {reviewAction && report.status !== "reviewed" ? (
                  <form action={reviewAction}>
                    <input type="hidden" name="reportId" value={report.id} />
                    <input type="hidden" name="returnTo" value={reviewReturnTo ?? "/staff/reports"} />
                    <Button
                      type="submit"
                      className="min-h-[42px] rounded-[12px] border-[#2563eb] bg-[#2563eb] px-4 py-2 text-sm text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)] hover:border-[#1d4fd7] hover:bg-[#1d4fd7]"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {report.paymentRequired && !report.paymentDetailsComplete
                        ? "Request payment details"
                        : report.paymentRequired
                          ? "Approve report & send to finance"
                          : "Approve report"}
                    </Button>
                  </form>
                ) : null}
              </div>
            </BookingDialogShell>,
            document.body
          )
        : null}

      {/* -------------------------------------------- media lightbox */}
      {lightbox
        ? createPortal(
            <div
              className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(4,15,75,0.78)] px-4 py-6"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setLightbox(null);
                }
              }}
              role="presentation"
            >
              <div className="relative max-h-full w-full max-w-[980px]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-white">
                    {lightbox.title ?? "Report media"}
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={mediaSrc(lightbox)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] bg-white/14 px-3.5 text-sm font-semibold text-white transition hover:bg-white/24"
                    >
                      Open original
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setLightbox(null)}
                      aria-label="Close media preview"
                      className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/14 text-white transition hover:bg-white/24"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {lightbox.type === "video" ? (
                  <video
                    src={mediaSrc(lightbox)}
                    controls
                    autoPlay
                    className="max-h-[78vh] w-full rounded-[18px] bg-black object-contain"
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={mediaSrc(lightbox)}
                    alt={lightbox.title ?? "Report media"}
                    className="max-h-[78vh] w-full rounded-[18px] bg-black object-contain"
                  />
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function SectionHeading({
  icon,
  index,
  children
}: {
  icon: ReactNode;
  index: number;
  children: ReactNode;
}) {
  return (
    <p className="mt-7 flex items-center gap-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--navy)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[color:var(--green-soft)] text-[color:var(--green)]">
        {icon}
      </span>
      {index}. {children}
    </p>
  );
}

function OverviewTile({
  icon,
  label,
  children
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--green-soft)] text-[color:var(--green)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
          {label}
        </span>
        <span className="mt-0.5 block text-sm font-medium leading-6 text-[color:var(--navy)]">
          {children}
        </span>
      </span>
    </div>
  );
}

function RatingTile({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </p>
      <div className="mt-2 flex justify-center">
        {Array.from({ length: 5 }, (_, index) => (
          <Star
            key={index}
            className={
              value && index < value
                ? "h-5 w-5 fill-[#f4b63f] text-[#f4b63f]"
                : "h-5 w-5 text-[rgba(4,15,75,0.16)]"
            }
          />
        ))}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {value ? (
          <>
            {value}
            <span className="text-sm font-medium text-[color:var(--text-soft)]">/5</span>
          </>
        ) : (
          <span className="text-sm font-medium text-[color:var(--text-soft)]">Not rated</span>
        )}
      </p>
    </div>
  );
}

function MediaTile({
  item,
  featured,
  onOpen
}: {
  item: ReportMediaItem;
  featured: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative overflow-hidden rounded-[16px] border border-[color:var(--border-soft)] bg-[#f1f5f9] text-left",
        featured ? "md:col-span-2 md:row-span-2 min-h-[220px]" : "min-h-[104px]"
      )}
      aria-label={item.title ?? "Open report media"}
    >
      {item.type === "image" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={mediaSrc(item)}
          alt={item.title ?? "Report media"}
          className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.03]"
        />
      ) : item.type === "video" ? (
        <>
          <video src={mediaSrc(item)} muted preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/92 text-[color:var(--navy)] shadow-[0_10px_24px_rgba(4,15,75,0.28)]">
              <Play className="ml-0.5 h-5 w-5" />
            </span>
          </span>
        </>
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
          <FileText className="h-7 w-7 text-[#64748b]" />
          <span className="line-clamp-2 text-xs font-semibold text-[color:var(--navy)]">
            {item.title ?? "Document"}
          </span>
        </span>
      )}
      <span className="absolute bottom-2 right-2 rounded-[8px] bg-[rgba(4,15,75,0.55)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
        {item.type}
      </span>
    </button>
  );
}

function FeedbackRow({
  icon,
  label,
  children
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--green-soft)] text-[color:var(--green)]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
          {label}
        </p>
        <p className="mt-0.5 whitespace-pre-line text-sm leading-6 text-[color:var(--navy)]">
          {children}
        </p>
      </div>
    </div>
  );
}

function JourneyStep({
  done,
  label,
  detail,
  last = false
}: {
  done: boolean;
  label: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
      <div className="flex flex-col items-center">
        {done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[color:var(--green)]" />
        ) : (
          <Circle className="h-5 w-5 shrink-0 text-[rgba(4,15,75,0.2)]" />
        )}
        {!last ? <span className="w-px flex-1 bg-[color:var(--border-soft)]" /> : null}
      </div>
      <div className={cn(!last && "pb-4")}>
        <p
          className={cn(
            "text-sm font-semibold",
            done ? "text-[color:var(--navy)]" : "text-[color:var(--text-soft)]"
          )}
        >
          {label}
        </p>
        <p className="text-xs text-[color:var(--text-soft)]">{detail}</p>
      </div>
    </div>
  );
}
