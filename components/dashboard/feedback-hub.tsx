"use client";

import {
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Globe2,
  Mail,
  MessagesSquare,
  Search,
  Star
} from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { DataTable, dataTableHeadingClassName } from "@/components/dashboard/data-table";
import { ReportDetailsButton } from "@/components/dashboard/report-details-dialog";
import { ReportsOverview } from "@/components/dashboard/reports-overview";
import { SchoolFeedbackDetailsButton } from "@/components/dashboard/school-feedback-details-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ReportSummary, SchoolFeedbackSummary } from "@/lib/domain/types";
import { cn, formatDateTime, formatShortDate } from "@/lib/utils";

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
  presentationFilterId
}: {
  reports: ReportSummary[];
  schoolReviews: SchoolFeedbackSummary[];
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
            onClick={() => setTab(option.value)}
            className={cn(
              "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[12px] px-4 text-sm font-semibold transition",
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
          <SchoolFeedbackOverview reviews={visibleReviews} />
          <DataTable
            title="School feedback submissions"
            columns={["School", "Presentation", "Submitted", "Rating", "Show on website", "Submission"]}
            headerContent={
              <label className="flex min-h-[46px] w-full items-center gap-2.5 rounded-[15px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
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
                footer={(activeReview) => (
                  <ShowOnWebsiteToggle
                    key={`${activeReview.id}-dialog-${activeReview.isApproved}-${activeReview.isPublic}`}
                    review={activeReview}
                    action={feedbackDecisionAction}
                    returnTo={returnTo}
                  />
                )}
              />
            ])}
            footerContent={
              matchingReviews.length > FEEDBACK_PAGE_SIZE ? (
                <FeedbackPagination
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
          <ReportsOverview reports={visibleReports} />
          <DataTable
            title="Ambassador session reports"
            headerContent={
              <label className="flex min-h-[46px] w-full items-center gap-2.5 rounded-[15px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
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
                <FeedbackPagination
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

function FeedbackPagination({
  currentPage,
  pageCount,
  totalItems,
  itemLabel,
  onPageChange
}: {
  currentPage: number;
  pageCount: number;
  totalItems: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  const firstItem = (currentPage - 1) * FEEDBACK_PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * FEEDBACK_PAGE_SIZE, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[color:var(--text-soft)]">
        Showing {firstItem} to {lastItem} of {totalItems} {itemLabel}
      </p>
      <div className="flex items-center gap-1.5" aria-label={`${itemLabel} pagination`}>
        <PaginationArrow
          disabled={currentPage === 1}
          label="Previous page"
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </PaginationArrow>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === currentPage ? "page" : undefined}
            className={cn(
              "flex h-9 min-w-9 items-center justify-center rounded-[10px] border px-2 text-sm font-semibold transition",
              pageNumber === currentPage
                ? "border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                : "border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] hover:border-[rgba(4,15,75,0.2)]"
            )}
          >
            {pageNumber}
          </button>
        ))}
        <PaginationArrow
          disabled={currentPage === pageCount}
          label="Next page"
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </PaginationArrow>
      </div>
    </div>
  );
}

function PaginationArrow({
  children,
  disabled,
  label,
  onClick
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:border-[rgba(4,15,75,0.2)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
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

function SchoolFeedbackOverview({ reviews }: { reviews: SchoolFeedbackSummary[] }) {
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

  return (
    <section className="surface-panel rounded-[28px] p-5 md:p-6">
      <h2 className={dataTableHeadingClassName}>
        Across all school feedback
      </h2>

      <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-5">
        <OverviewTile
          icon={<MessagesSquare className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#2563eb]"
          label="Reviews submitted"
          value={String(reviews.length)}
        />
        <OverviewTile
          icon={<Star className="h-5 w-5" />}
          iconClassName="bg-[#fff5df] text-[#b7791f]"
          label="Overall rating"
          value={overall === null ? "—" : `${overall.toFixed(1)}/5`}
        />
        <OverviewTile
          icon={<Gamepad2 className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          label="Considering a club"
          value={consideringPct === null ? "—" : `${consideringPct}%`}
        />
        <OverviewTile
          icon={<Mail className="h-5 w-5" />}
          iconClassName="bg-[#ece9ff] text-[#5b4fc0]"
          label="Mailing list opt-ins"
          value={String(mailingListCount)}
        />
        <OverviewTile
          icon={<Globe2 className="h-5 w-5" />}
          iconClassName="bg-[#fde8f0] text-[#be185d]"
          label="Live on website"
          value={String(liveCount)}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
        <div className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[color:var(--navy)]">Average ratings</p>
            {overall !== null ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5df] px-3 py-1 text-sm font-semibold text-[#b7791f]">
                <Star className="h-4 w-4 fill-[#f4b63f] text-[#f4b63f]" />
                {overall.toFixed(1)} / 5 overall
              </span>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3">
            {categoryRows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_44px] items-center gap-3"
              >
                <span className="text-sm text-[color:var(--text-soft)]">{row.label}</span>
                <div className="h-2.5 rounded-full bg-[#e6ecf5]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      (row.value ?? 0) >= 4
                        ? "bg-[linear-gradient(135deg,#18a83b,#47c96a)]"
                        : "bg-[linear-gradient(135deg,#2563eb,#60a5fa)]"
                    )}
                    style={{ width: `${((row.value ?? 0) / 5) * 100}%` }}
                  />
                </div>
                <span className="text-right text-sm font-semibold text-[color:var(--navy)]">
                  {row.value === null ? "—" : row.value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
          <p className="text-sm font-semibold text-[color:var(--navy)]">Latest feedback</p>
          <div className="mt-3 grid gap-3">
            {latest.length === 0 ? (
              <p className="text-sm text-[color:var(--text-soft)]">
                Written feedback from schools will appear here.
              </p>
            ) : null}
            {latest.map((review) => (
              <blockquote
                key={review.id}
                className="rounded-[16px] bg-[#f6f9fd] px-4 py-3 text-sm leading-6 text-[color:var(--navy)]"
              >
                “{review.quote.trim()}”
                <footer className="mt-1 text-xs text-[color:var(--text-soft)]">
                  {review.attribution ?? "School contact"} · {review.schoolName} ·{" "}
                  {review.presentationTitle}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewTile({
  icon,
  iconClassName,
  label,
  value
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-4">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
          iconClassName
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[color:var(--text-soft)]">{label}</p>
        <p className="truncate text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {value}
        </p>
      </div>
    </div>
  );
}
