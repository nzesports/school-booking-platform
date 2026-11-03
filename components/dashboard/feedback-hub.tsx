"use client";

import {
  Gamepad2,
  Globe2,
  Mail,
  Search,
  Star
} from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { DataTable, dataTableHeadingClassName } from "@/components/dashboard/data-table";
import { ListPagination } from "@/components/dashboard/list-pagination";
import { ReportDetailsButton } from "@/components/dashboard/report-details-dialog";
import { ReportsOverview } from "@/components/dashboard/reports-overview";
import { SchoolFeedbackDetailsButton } from "@/components/dashboard/school-feedback-details-dialog";
import { StarRating } from "@/components/ui/star-rating";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BookingSessionView, ReportSummary, SchoolFeedbackSummary } from "@/lib/domain/types";
import { cn, formatDateTime, formatShortDate, initials } from "@/lib/utils";

type FeedbackTab = "school" | "ambassador";
const FEEDBACK_PAGE_SIZE = 10;

// One home for everything schools and ambassadors send back after sessions:
// school feedback (with website publishing) and ambassador session reports.
export function FeedbackHub({
  reports,
  schoolReviews,
  reviewAction,
  feedbackDecisionAction,
  returnTo,
  reportsReturnTo,
  initialTab = "school",
  showAmbassadorColumn = false,
  presentationFilterId,
  deliveredSessions = [],
  periodLabel
}: {
  reports: ReportSummary[];
  schoolReviews: SchoolFeedbackSummary[];
  deliveredSessions?: BookingSessionView[];
  periodLabel?: string;
  reviewAction: (formData: FormData) => void | Promise<void>;
  feedbackDecisionAction: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  reportsReturnTo: string;
  initialTab?: FeedbackTab;
  showAmbassadorColumn?: boolean;
  presentationFilterId?: string;
}) {
  const [tab, setTab] = useState<FeedbackTab>(initialTab);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [reportQuery, setReportQuery] = useState("");
  const [schoolPage, setSchoolPage] = useState(1);
  const [reportPage, setReportPage] = useState(1);
  const visibleReviews = presentationFilterId
    ? schoolReviews.filter((review) => review.presentationTypeId === presentationFilterId)
    : schoolReviews;
  const visibleReports = presentationFilterId
    ? reports.filter((report) => report.presentationTypeId === presentationFilterId)
    : reports;
  const visibleDeliveredSessions = presentationFilterId
    ? deliveredSessions.filter((session) => session.presentationTypeId === presentationFilterId)
    : deliveredSessions;
  const selectTab = (value: FeedbackTab) => {
    setTab(value);
    // Keep the tab in the URL so changing the date range reopens the same tab.
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("tab", value);
    window.history.replaceState(null, "", `?${searchParams.toString()}`);
  };
  const normalizedSchoolQuery = schoolQuery.trim().toLowerCase();
  const matchingReviews = normalizedSchoolQuery
    ? visibleReviews.filter((review) =>
        [
          review.schoolName,
          review.presentationTitle,
          review.attribution,
          review.quote
        ].some((value) => value?.toLowerCase().includes(normalizedSchoolQuery))
      )
    : visibleReviews;
  const normalizedReportQuery = reportQuery.trim().toLowerCase();
  const matchingReports = normalizedReportQuery
    ? visibleReports.filter((report) =>
        [
          report.schoolName,
          report.presentationTitle,
          report.submittedAt,
          formatDateTime(report.submittedAt),
          report.attendeeCount,
          report.status,
          report.ambassadorName,
          report.presenterName,
          report.schoolRollSize,
          report.primaryContactName,
          report.primaryContactEmail,
          report.deliveredAt,
          report.ageGroups,
          report.yearLevels,
          report.attendeeQuotes,
          report.attendanceRating,
          report.teacherResponseRating,
          report.studentEngagementRating,
          report.presentationEnergyRating,
          report.notableQuestions,
          report.presentationFeedback,
          report.additionalNotes
        ].some((value) => String(value ?? "").toLowerCase().includes(normalizedReportQuery))
      )
    : visibleReports;
  const schoolPageCount = Math.max(1, Math.ceil(matchingReviews.length / FEEDBACK_PAGE_SIZE));
  const safeSchoolPage = Math.min(schoolPage, schoolPageCount);
  const pagedReviews = matchingReviews.slice(
    (safeSchoolPage - 1) * FEEDBACK_PAGE_SIZE,
    safeSchoolPage * FEEDBACK_PAGE_SIZE
  );
  // The feedback dialog's footer, wherever it's opened from on this page.
  const dialogWebsiteToggle = (activeReview: SchoolFeedbackSummary) => (
    <ShowOnWebsiteToggle
      key={`${activeReview.id}-dialog-${activeReview.isApproved}-${activeReview.isPublic}`}
      review={activeReview}
      action={feedbackDecisionAction}
      returnTo={returnTo}
    />
  );
  const reportPageCount = Math.max(1, Math.ceil(matchingReports.length / FEEDBACK_PAGE_SIZE));
  const safeReportPage = Math.min(reportPage, reportPageCount);
  const pagedReports = matchingReports.slice(
    (safeReportPage - 1) * FEEDBACK_PAGE_SIZE,
    safeReportPage * FEEDBACK_PAGE_SIZE
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-1.5 self-start rounded-[16px] border border-[color:var(--border-soft)] bg-white p-1.5">
        {(
          [
            { value: "school", label: "School feedback", count: visibleReviews.length },
            { value: "ambassador", label: "Ambassador feedback", count: visibleReports.length }
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => selectTab(option.value)}
            className={cn(
              "inline-flex min-h-[36px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-4 text-[12px] font-semibold transition",
              option.value === tab
                ? "border border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
            )}
          >
            {option.label}
            <span
              className={cn(
                "inline-flex min-w-[24px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                option.value === tab
                  ? "bg-white text-[#117a2e]"
                  : "bg-[#eef2f8] text-[color:var(--text-soft)]"
              )}
            >
              {option.count}
            </span>
          </button>
        ))}
      </div>

      {tab === "school" ? (
        <div className="grid gap-5">
          <SchoolFeedbackOverview
            reviews={visibleReviews}
            periodLabel={periodLabel}
            dialogFooter={dialogWebsiteToggle}
          />
          <DataTable
            title="School feedback submissions"
            columns={["School", "Presentation", "Submitted", "Rating", "Show on website", "Submission"]}
            headerContent={
              <label className="flex min-h-[36px] w-full items-center gap-2.5 rounded-[8px] border border-[color:var(--border-soft)] bg-white px-3 text-[12px] text-[color:var(--navy)]">
                <Search className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                <span className="sr-only">Search school feedback</span>
                <input
                  type="search"
                  value={schoolQuery}
                  onChange={(event) => {
                    setSchoolQuery(event.target.value);
                    setSchoolPage(1);
                  }}
                  placeholder="Search by school, presentation, or feedback..."
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
                />
              </label>
            }
            emptyMessage={schoolQuery ? "No school feedback matches your search." : undefined}
            rows={pagedReviews.map((review) => [
              review.schoolName,
              review.presentationTitle,
              formatShortDate(review.createdAt),
              typeof review.rating === "number" ? (
                <span
                  key={`${review.id}-rating`}
                  className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--navy)]"
                >
                  <Star className="h-4 w-4 fill-[#f4b63f] text-[#f4b63f]" />
                  {review.rating}/5
                </span>
              ) : (
                "—"
              ),
              <ShowOnWebsiteToggle
                key={`${review.id}-${review.isApproved}-${review.isPublic}`}
                review={review}
                action={feedbackDecisionAction}
                returnTo={returnTo}
              />,
              <SchoolFeedbackDetailsButton
                key={`${review.id}-view`}
                review={review}
                reviews={matchingReviews}
                footer={dialogWebsiteToggle}
              />
            ])}
            footerContent={
              matchingReviews.length > FEEDBACK_PAGE_SIZE ? (
                <ListPagination
                  pageSize={FEEDBACK_PAGE_SIZE}
                  currentPage={safeSchoolPage}
                  pageCount={schoolPageCount}
                  totalItems={matchingReviews.length}
                  itemLabel="school feedback submissions"
                  onPageChange={setSchoolPage}
                />
              ) : null
            }
          />
        </div>
      ) : (
        <div className="grid gap-5">
          <ReportsOverview
            reports={visibleReports}
            deliveredSessions={visibleDeliveredSessions}
            periodLabel={periodLabel}
          />
          <DataTable
            title="Ambassador session reports"
            headerContent={
              <label className="flex min-h-[36px] w-full items-center gap-2.5 rounded-[8px] border border-[color:var(--border-soft)] bg-white px-3 text-[12px] text-[color:var(--navy)]">
                <Search className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                <span className="sr-only">Search ambassador session reports</span>
                <input
                  type="search"
                  value={reportQuery}
                  onChange={(event) => {
                    setReportQuery(event.target.value);
                    setReportPage(1);
                  }}
                  placeholder="Search any ambassador report detail..."
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
                />
              </label>
            }
            emptyMessage={reportQuery ? "No ambassador reports match your search." : undefined}
            columns={
              showAmbassadorColumn
                ? ["School", "Presentation", "Submitted", "Attendees", "Ambassador", "Status", "Report"]
                : ["School", "Presentation", "Submitted", "Attendees", "Status", "Report"]
            }
            rows={pagedReports.map((report) => {
              const cells: ReactNode[] = [
                report.schoolName,
                report.presentationTitle,
                formatDateTime(report.submittedAt),
                String(report.attendeeCount)
              ];

              if (showAmbassadorColumn) {
                cells.push(report.ambassadorName ?? report.presenterName ?? "Unassigned");
              }

              cells.push(
                <StatusBadge key={`${report.id}-status`} value={report.status} />,
                <ReportDetailsButton
                  key={`${report.id}-view`}
                  report={report}
                  reports={matchingReports}
                  reviewAction={reviewAction}
                  reviewReturnTo={reportsReturnTo}
                />
              );

              return cells;
            })}
            footerContent={
              matchingReports.length > FEEDBACK_PAGE_SIZE ? (
                <ListPagination
                  pageSize={FEEDBACK_PAGE_SIZE}
                  currentPage={safeReportPage}
                  pageCount={reportPageCount}
                  totalItems={matchingReports.length}
                  itemLabel="ambassador session reports"
                  onPageChange={setReportPage}
                />
              ) : null
            }
          />
        </div>
      )}
    </div>
  );
}

// Single switch controlling both moderation flags: ticked means the written
// review is approved AND shown on the public site; unticking hides it again.
function ShowOnWebsiteToggle({
  review,
  action,
  returnTo
}: {
  review: SchoolFeedbackSummary;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  const isLive = review.isApproved && review.isPublic;
  const [checked, setChecked] = useState(isLive);
  const [pending, startTransition] = useTransition();

  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-sm font-semibold",
        pending ? "opacity-60" : "",
        checked ? "text-[#117a2e]" : "text-[color:var(--text-soft)]"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.checked;
          setChecked(next);
          const formData = new FormData();
          formData.set("reviewId", review.id);
          formData.set("returnTo", returnTo);
          formData.set("decision", next ? "approve" : "unapprove");

          if (next) {
            formData.set("makePublic", "on");
          }

          startTransition(() => action(formData));
        }}
        className="h-4 w-4 accent-[color:var(--green)]"
      />
      {pending ? "Saving…" : checked ? "Live on website" : "Show on website"}
    </label>
  );
}

function SchoolFeedbackOverview({
  reviews,
  periodLabel,
  dialogFooter
}: {
  reviews: SchoolFeedbackSummary[];
  periodLabel?: string;
  dialogFooter: (review: SchoolFeedbackSummary) => ReactNode;
}) {
  const ratings = reviews
    .map((review) => review.rating)
    .filter((rating): rating is number => typeof rating === "number");
  const overall =
    ratings.length > 0 ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length : null;
  const withDetails = reviews.filter((review) => review.details);
  const consideringPct =
    withDetails.length > 0
      ? Math.round(
          (withDetails.filter((review) => review.details?.consideringClub === "yes").length /
            withDetails.length) *
            100
        )
      : null;
  const mailingListCount = withDetails.filter(
    (review) => review.details?.mailingListOptIn === "yes"
  ).length;
  const liveCount = reviews.filter((review) => review.isApproved && review.isPublic).length;
  const categoryRows = [
    { key: "attendanceRating", label: "Attendance" },
    { key: "studentResponseRating", label: "Student response" },
    { key: "contentRating", label: "Content" },
    { key: "presenterEnergyRating", label: "Presenter energy" }
  ].map((row) => {
    const values = withDetails
      .map((review) => review.details?.[row.key as keyof NonNullable<SchoolFeedbackSummary["details"]>])
      .filter((value): value is number => typeof value === "number");

    return {
      label: row.label,
      value: values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null
    };
  });
  const latest = reviews.filter((review) => review.quote?.trim()).slice(0, 3);
  const engagement = [
    {
      icon: <Gamepad2 className="h-3.5 w-3.5 shrink-0" />,
      value: consideringPct === null ? "—" : `${consideringPct}%`,
      label: "considering a club"
    },
    {
      icon: <Mail className="h-3.5 w-3.5 shrink-0" />,
      value: String(mailingListCount),
      label: mailingListCount === 1 ? "mailing list opt-in" : "mailing list opt-ins"
    },
    {
      icon: <Globe2 className="h-3.5 w-3.5 shrink-0" />,
      value: `${liveCount} of ${reviews.length}`,
      label: "live on website"
    }
  ];

  return (
    <section className="surface-panel rounded-[28px] p-5 md:p-6">
      <h2 className={dataTableHeadingClassName}>
        {periodLabel && periodLabel !== "All time"
          ? `Across all school feedback · ${periodLabel}`
          : "Across all school feedback"}
      </h2>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* Stretched to the latest feedback's height; any spare room is shared
            between the sections rather than left empty at the bottom. */}
        <div className="flex flex-col justify-between gap-6 rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[color:var(--navy)]">Overall rating</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="text-5xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                  {overall === null ? "—" : overall.toFixed(1)}
                </span>
                <span className="text-base text-[color:var(--text-soft)]">/ 5</span>
              </p>
              {overall !== null ? (
                <StarRating rating={overall} className="mt-2" starClassName="h-5 w-5" />
              ) : null}
            </div>
            <p className="text-sm text-[color:var(--text-soft)]">
              From {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </p>
          </div>

          <div className="grid gap-4 border-t border-[color:var(--border-soft)] pt-5">
            {categoryRows.map((row) => {
              // Below 4 the bar turns amber so a slipping category stands out.
              const strong = (row.value ?? 0) >= 4;

              return (
                <div key={row.label} className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[color:var(--text-soft)]">{row.label}</span>
                    <span className="font-semibold text-[color:var(--navy)]">
                      {row.value === null ? "—" : row.value.toFixed(1)}
                    </span>
                  </div>
                  <div className={cn("h-2 rounded-full", strong ? "bg-[#e3f4e7]" : "bg-[#fdf0d9]")}>
                    <div
                      className={cn("h-full rounded-full", strong ? "bg-[#18a83b]" : "bg-[#f5a623]")}
                      style={{ width: `${((row.value ?? 0) / 5) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 divide-x divide-[color:var(--border-soft)] border-t border-[color:var(--border-soft)] pt-5">
            {engagement.map((item) => (
              <div key={item.label} className="grid content-start gap-1 px-3 first:pl-0 last:pr-0">
                <p className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                  {item.value}
                </p>
                <p className="flex items-start gap-1.5 text-xs leading-4 text-[color:var(--text-soft)]">
                  {item.icon}
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5 md:p-6">
          <p className="text-sm font-semibold text-[color:var(--navy)]">Latest feedback</p>
          <div className="mt-4 grid gap-3">
            {latest.length === 0 ? (
              <p className="text-sm text-[color:var(--text-soft)]">
                Written feedback from schools will appear here.
              </p>
            ) : null}
            {latest.map((review) => {
              // The form's own name fields read cleaner than the stored
              // "Name, Role" attribution, which older reviews fall back to.
              const fullName = [review.details?.firstName, review.details?.lastName]
                .filter(Boolean)
                .join(" ");
              const name = fullName || review.attribution || "School contact";
              const role = fullName ? review.details?.role : undefined;

              return (
                <figure key={review.id} className="grid gap-2 rounded-[18px] bg-[#f6f9fd] p-4">
                  {typeof review.rating === "number" ? (
                    <StarRating rating={review.rating} starClassName="h-3.5 w-3.5" />
                  ) : null}
                  {/* Long reviews are cut to three lines; the eye button opens the full text. */}
                  <blockquote className="line-clamp-3 text-[15px] leading-7 text-[color:var(--navy)]">
                    “{review.quote.trim()}”
                  </blockquote>
                  <figcaption className="mt-1 flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eaf8ee] text-[11px] font-semibold text-[#117a2e]">
                      {initials(name)}
                    </span>
                    <span className="min-w-0 flex-1 text-xs leading-5">
                      <span className="block truncate font-semibold text-[color:var(--navy)]">
                        {name}
                        {role ? (
                          <span className="font-normal text-[color:var(--text-soft)]"> · {role}</span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[color:var(--text-soft)]">
                        {review.schoolName} · {review.presentationTitle}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-[color:var(--text-soft)]">
                      {formatShortDate(review.createdAt)}
                    </span>
                    <SchoolFeedbackDetailsButton
                      review={review}
                      reviews={reviews}
                      footer={dialogFooter}
                      label="View feedback"
                      iconOnly
                      className="shrink-0"
                    />
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

