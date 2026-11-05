"use client";

import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleMinus,
  Gamepad2,
  HeartHandshake,
  Hourglass,
  Landmark,
  Mail,
  MessageSquareText,
  Phone,
  Search,
  StickyNote,
  UserRound,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { StatusPill } from "@/components/dashboard/bookings-explorer";
import { SessionDetailsButton } from "@/components/dashboard/session-details-dialog";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import type { BookingRequestView, BookingSessionView, PaymentStatus, School } from "@/lib/domain/types";
import { groupSameDaySessions, nzDayKey } from "@/lib/same-day-sessions";
import {
  isCancelledSession,
  isCountedPresentation,
  isFutureSession
} from "@/lib/services/dashboard-insights";
import { cn, formatShortDate, formatTime } from "@/lib/utils";

const PAGE_SIZE = 8;
const schoolTableColumns = [
  { label: "School", width: "18%" },
  { label: "Contact", width: "15%" },
  { label: "Region", width: "8%" },
  { label: "Delivered", width: "9%" },
  { label: "Presentations", width: "11%" },
  { label: "Year groups", width: "10%" },
  { label: "Last session", width: "10.5%" },
  { label: "Next session", width: "10.5%" },
  { label: "Bookings", width: "8%" }
] as const;

export type SchoolDeliverySummary = {
  school: School;
  contactName?: string | null;
  deliveredCount: number;
  upcomingCount: number;
  presentationsDelivered: string[];
  yearGroupsReached: number[];
  lastDeliveredLabel: string;
  nextSessionLabel: string;
  lastDeliveredAt: string | null;
  nextSessionAt: string | null;
};

const presentationChipStyles = [
  { chip: "bg-[#e8f1fd] text-[#1e4fae]", icon: HeartHandshake },
  { chip: "bg-[#f1edfd] text-[#7c3aed]", icon: Gamepad2 },
  { chip: "bg-[#e6f5ec] text-[#117a2e]", icon: BriefcaseBusiness },
  { chip: "bg-[#fff5df] text-[#9a5a00]", icon: UsersRound }
];

function presentationChipStyle(title: string) {
  let hash = 0;

  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 31 + title.charCodeAt(index)) | 0;
  }

  return presentationChipStyles[Math.abs(hash) % presentationChipStyles.length];
}

function summarizeYearGroups(yearGroups: number[]) {
  const sorted = [...new Set(yearGroups)].sort((left, right) => left - right);
  const title = sorted.map((year) => `Y${year}`).join(", ");

  if (sorted.length === 0) {
    return { label: "Not set", title: "No year groups recorded" };
  }

  const consecutive = sorted.every(
    (year, index) => index === 0 || year === sorted[index - 1] + 1
  );

  if (consecutive) {
    return {
      label: sorted.length === 1 ? `Y${sorted[0]}` : `Y${sorted[0]}–Y${sorted.at(-1)}`,
      title
    };
  }

  return {
    label: sorted.length <= 2 ? title : `${sorted.length} groups`,
    title
  };
}

export function SchoolsExplorer({
  summaries,
  regions,
  bookings,
  basePath,
  pendingReviewSchools,
  mergeTargetSchools,
  mergeSchoolAction
}: {
  summaries: SchoolDeliverySummary[];
  regions: Array<{ slug: string; name: string }>;
  bookings: BookingRequestView[];
  basePath: string;
  pendingReviewSchools: School[];
  mergeTargetSchools: School[];
  mergeSchoolAction: (formData: FormData) => void | Promise<void>;
}) {
  const [scheduleTab, setScheduleTab] = useState<
    "all" | "upcoming" | "completed" | "merges"
  >("all");
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [presentationFilter, setPresentationFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"activity" | "name" | "delivered">("activity");
  const [page, setPage] = useState(1);
  const [bookingsSchool, setBookingsSchool] = useState<School | null>(null);

  const regionNameBySlug = useMemo(
    () => new Map(regions.map((region) => [region.slug, region.name])),
    [regions]
  );
  const presentationOptions = useMemo(
    () =>
      Array.from(
        new Set(summaries.flatMap((summary) => summary.presentationsDelivered))
      ).sort(),
    [summaries]
  );

  const scheduleTabs = [
    { value: "all" as const, label: "All schools", count: summaries.length },
    {
      value: "upcoming" as const,
      label: "Upcoming",
      count: summaries.filter((summary) => summary.upcomingCount > 0).length
    },
    {
      value: "completed" as const,
      label: "Completed",
      count: summaries.filter((summary) => summary.deliveredCount > 0).length
    },
    {
      value: "merges" as const,
      label: "Pending merges",
      count: pendingReviewSchools.length
    }
  ];

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = summaries.filter((summary) => {
      const regionName = regionNameBySlug.get(summary.school.regionSlug) ?? "";
      const haystack = [
        summary.school.name,
        summary.school.city,
        summary.school.regionSlug,
        regionName,
        summary.contactName ?? "",
        summary.school.contactEmail ?? "",
        summary.school.contactPhone ?? "",
        summary.presentationsDelivered.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return (
        (scheduleTab === "all" ||
          (scheduleTab === "upcoming" && summary.upcomingCount > 0) ||
          (scheduleTab === "completed" && summary.deliveredCount > 0)) &&
        (!normalized || haystack.includes(normalized)) &&
        (regionFilter === "all" || summary.school.regionSlug === regionFilter) &&
        (presentationFilter === "all" ||
          summary.presentationsDelivered.includes(presentationFilter))
      );
    });

    if (sortBy === "name") {
      return [...matches].sort((a, b) => a.school.name.localeCompare(b.school.name));
    }

    if (sortBy === "delivered") {
      return [...matches].sort((a, b) => b.deliveredCount - a.deliveredCount);
    }

    const activityStamp = (summary: SchoolDeliverySummary) =>
      Math.max(
        summary.lastDeliveredAt ? new Date(summary.lastDeliveredAt).getTime() : 0,
        summary.nextSessionAt ? new Date(summary.nextSessionAt).getTime() : 0
      );

    return [...matches].sort((a, b) => activityStamp(b) - activityStamp(a));
  }, [summaries, scheduleTab, query, regionFilter, presentationFilter, sortBy, regionNameBySlug]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageSummaries = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="grid gap-5">
      {/* ------------------------------------------------ schedule tabs */}
      <div className="flex flex-wrap gap-1.5 self-start rounded-[16px] border border-[color:var(--border-soft)] bg-white p-1.5">
        {scheduleTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setScheduleTab(tab.value);
              setPage(1);
            }}
            className={cn(
              "inline-flex min-h-[36px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-4 text-[12px] font-semibold transition",
              tab.value === scheduleTab
                ? "border border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "inline-flex min-w-[24px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                tab.value === scheduleTab
                  ? "bg-white text-[#117a2e]"
                  : "bg-[#eef2f8] text-[color:var(--text-soft)]"
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {scheduleTab === "merges" ? (
        <PendingSchoolMerges
          schools={pendingReviewSchools}
          targets={mergeTargetSchools}
          action={mergeSchoolAction}
          returnTo={`${basePath}/schools`}
        />
      ) : (
        <>
          {/* ------------------------------------------------ toolbar */}
          <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[36px] min-w-[240px] flex-1 items-center gap-2.5 rounded-[8px] border border-[color:var(--border-soft)] bg-white px-3 text-[12px] text-[color:var(--navy)]">
          <Search className="h-4 w-4 text-[color:var(--text-soft)]" />
          <span className="sr-only">Search schools</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search schools by name or region..."
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
          />
        </label>
        <ToolbarSelect
          value={regionFilter}
          onChange={(value) => {
            setRegionFilter(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All regions" },
            ...regions.map((region) => ({ value: region.slug, label: region.name }))
          ]}
        />
        <ToolbarSelect
          value={presentationFilter}
          onChange={(value) => {
            setPresentationFilter(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All presentation types" },
            ...presentationOptions.map((title) => ({ value: title, label: title }))
          ]}
        />
        <ToolbarSelect
          value={sortBy}
          onChange={(value) => setSortBy(value as "activity" | "name" | "delivered")}
          options={[
            { value: "activity", label: "Sort by: Latest activity" },
            { value: "name", label: "Sort by: School name" },
            { value: "delivered", label: "Sort by: Most delivered" }
          ]}
        />
          </div>

      {/* ------------------------------------------------ table */}
          <div className="max-w-full overflow-x-auto rounded-[20px] border border-[color:var(--border-soft)] bg-white">
        <table className="w-full min-w-[1280px] table-fixed border-separate border-spacing-0">
          <colgroup>
            {schoolTableColumns.map((column) => (
              <col key={column.label} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {schoolTableColumns.map((column) => (
                <th
                  key={column.label}
                  className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-[color:rgba(4,15,75,0.08)] bg-[#f6f9fd] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageSummaries.map((summary) => {
              const delivered = summary.deliveredCount > 0;
              const yearGroups = summarizeYearGroups(summary.yearGroupsReached);

              return (
                <tr key={summary.school.id} className="align-middle">
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    <span className="flex min-w-0 items-center gap-3">
                      {summary.school.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={summary.school.logoUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full border border-[color:var(--border-soft)] bg-white object-contain p-0.5"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef2f8] text-[color:var(--navy)]">
                          <Landmark className="h-4 w-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <TruncatedText
                          className="text-sm font-semibold text-[color:var(--navy)]"
                          title={summary.school.name}
                        />
                        <TruncatedText
                          className="text-xs text-[color:var(--text-soft)]"
                          title={summary.contactName ?? summary.school.city}
                        />
                      </span>
                    </span>
                  </td>
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    {summary.school.contactEmail || summary.school.contactPhone ? (
                      <span className="grid min-w-0 gap-1">
                        {summary.school.contactEmail ? (
                          <a
                            href={`mailto:${summary.school.contactEmail}`}
                            className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-[#1e4fae] hover:underline"
                            title={summary.school.contactEmail}
                          >
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <TruncatedText title={summary.school.contactEmail} />
                          </a>
                        ) : null}
                        {summary.school.contactPhone ? (
                          <a
                            href={`tel:${summary.school.contactPhone}`}
                            className="flex min-w-0 items-center gap-1.5 text-xs text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
                            title={summary.school.contactPhone}
                          >
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <TruncatedText title={summary.school.contactPhone} />
                          </a>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-sm text-[color:var(--text-soft)]">
                        No contact on record
                      </span>
                    )}
                  </td>
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--navy)]">
                    <TruncatedText
                      title={
                        regionNameBySlug.get(summary.school.regionSlug) ??
                        summary.school.regionSlug
                      }
                    />
                  </td>
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    <span className="flex min-w-0 items-center gap-2.5">
                      {delivered ? (
                        <CircleCheck className="h-5 w-5 shrink-0 text-[#18a83b]" />
                      ) : (
                        <CircleMinus className="h-5 w-5 shrink-0 text-[#94a3b8]" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[color:var(--navy)]">
                          {summary.deliveredCount} session{summary.deliveredCount === 1 ? "" : "s"}
                        </span>
                        <span className="block truncate text-xs text-[color:var(--text-soft)]">
                          {delivered ? `Last: ${summary.lastDeliveredLabel}` : "Not yet delivered"}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    {summary.presentationsDelivered.length > 0 ? (
                      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                        {summary.presentationsDelivered.slice(0, 1).map((title) => {
                          const style = presentationChipStyle(title);
                          const ChipIcon = style.icon;

                          return (
                            <span
                              key={title}
                              className={cn(
                                "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                                style.chip
                              )}
                              title={title}
                            >
                              <ChipIcon className="h-3.5 w-3.5 shrink-0" />
                              <TruncatedText title={title} />
                            </span>
                          );
                        })}
                        {summary.presentationsDelivered.length > 1 ? (
                          <span
                            className="shrink-0 text-xs font-semibold text-[color:var(--text-soft)]"
                            title={summary.presentationsDelivered.slice(1).join(", ")}
                          >
                            +{summary.presentationsDelivered.length - 1}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#64748b]">
                        <Hourglass className="h-3 w-3" />
                        Not yet delivered
                      </span>
                    )}
                  </td>
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    <span
                      className={cn(
                        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                        summary.yearGroupsReached.length > 0
                          ? "bg-[#e8f1fd] text-[#1e4fae]"
                          : "bg-[#f1f5f9] text-[#64748b]"
                      )}
                      title={yearGroups.title}
                    >
                      <UsersRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <TruncatedText title={yearGroups.title}>{yearGroups.label}</TruncatedText>
                    </span>
                  </td>
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--navy)]">
                    {delivered ? (
                      <TruncatedText title={summary.lastDeliveredLabel} />
                    ) : (
                      <span className="text-[color:var(--text-soft)]">Not yet delivered</span>
                    )}
                  </td>
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    {summary.nextSessionAt ? (
                      <span
                        className="flex min-w-0 items-center gap-2 text-sm font-medium text-[color:var(--navy)]"
                        title={summary.nextSessionLabel}
                      >
                        <CalendarDays className="h-4 w-4 shrink-0 text-[#18a83b]" />
                        <TruncatedText title={summary.nextSessionLabel} />
                      </span>
                    ) : (
                      <span className="text-sm text-[color:var(--text-soft)]">None scheduled</span>
                    )}
                  </td>
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-2 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => setBookingsSchool(summary.school)}
                      aria-label={`View bookings for ${summary.school.name}`}
                      className="inline-flex min-h-[36px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#c4dbfb] bg-white px-4 text-[12px] font-semibold text-[#1e4fae] transition hover:bg-[#f4f8ff]"
                    >
                      <CalendarDays className="h-3 w-3" />
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {pageSummaries.length === 0 ? (
          <p className="px-5 py-10 text-sm text-[color:var(--text-soft)]">
            No schools match those filters yet.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border-soft)] bg-[#f6f9fd] px-5 py-3">
          <p className="text-sm text-[color:var(--text-soft)]">
            Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1} to{" "}
            {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} school
            {filtered.length === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-1.5">
            <PageArrow
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              ariaLabel="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </PageArrow>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={cn(
                  "flex min-h-[36px] min-w-[36px] items-center justify-center rounded-[8px] border px-2.5 text-[12px] font-semibold transition",
                  pageNumber === safePage
                    ? "border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                    : "border-[color:var(--border-soft)] bg-white text-[color:var(--navy)]"
                )}
              >
                {pageNumber}
              </button>
            ))}
            <PageArrow
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              ariaLabel="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </PageArrow>
          </div>
        </div>
          </div>

      {/* ------------------------------------------------ bookings popup */}
          {bookingsSchool
            ? createPortal(
            <SchoolBookingsDialog
              school={bookingsSchool}
              bookings={bookings.filter(
                (booking) =>
                  booking.schoolName === bookingsSchool.name ||
                  booking.sessions.some((session) => session.schoolId === bookingsSchool.id)
              )}
              basePath={basePath}
              onClose={() => setBookingsSchool(null)}
            />,
            document.body
              )
            : null}
        </>
      )}
    </div>
  );
}

function PendingSchoolMerges({
  schools,
  targets,
  action,
  returnTo
}: {
  schools: School[];
  targets: School[];
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  if (schools.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-[color:var(--border-soft)] bg-white/70 px-5 py-10 text-center text-sm text-[color:var(--text-soft)]">
        No school records are waiting to be merged.
      </div>
    );
  }

  if (targets.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-[color:var(--border-soft)] bg-white/70 px-5 py-10 text-center text-sm text-[color:var(--text-soft)]">
        Add an active school before resolving pending merges.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {schools.map((school) => (
        <form
          key={school.id}
          action={action}
          className="grid gap-3 rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center"
        >
          <input type="hidden" name="duplicateSchoolId" value={school.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
              Pending duplicate
            </p>
            <p className="mt-1 font-semibold text-[color:var(--navy)]">{school.name}</p>
            <p className="text-sm text-[color:var(--text-soft)]">{school.city}</p>
          </div>
          <select
            name="targetSchoolId"
            required
            className="min-h-[36px] w-full rounded-[8px] border border-[color:var(--border-soft)] bg-white px-3 py-[9px] text-[12px] text-[color:var(--text-dark)]"
          >
            <option value="">Merge into...</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
          <PendingSubmitButton unstyled
            type="submit"
            className="inline-flex items-center justify-center border border-[#a2cae3] bg-[#afd5ed] text-[color:var(--navy)]"
          >
            Merge school
          </PendingSubmitButton>
        </form>
      ))}
    </div>
  );
}

function SchoolBookingsDialog({
  school,
  bookings,
  basePath,
  onClose
}: {
  school: School;
  bookings: BookingRequestView[];
  basePath: string;
  onClose: () => void;
}) {
  const sorted = [...bookings].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const sessions = sorted.flatMap((booking) => booking.sessions);
  // Same rules as the schools table row, so the dialog never disagrees with it.
  const deliveredSessions = sessions.filter((session) => isCountedPresentation(session));
  const upcomingSessions = sessions.filter((session) => isFutureSession(session));
  const daysVisited = new Set(deliveredSessions.map((session) => nzDayKey(session.startsAt))).size;
  const schoolAddress = sessions.find((session) => session.schoolAddress)?.schoolAddress;

  return (
    <BookingDialogShell
      kicker="School bookings"
      title={school.name}
      description={schoolAddress}
      descriptionClassName="mt-1 text-sm leading-6"
      onClose={onClose}
      maxWidthClassName="max-w-[980px]"
      overlayClassName="z-[80]"
      compact
    >
      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <BookingMetric label="Presentations delivered" value={String(deliveredSessions.length)} tone="green" />
        <BookingMetric label="Days visited" value={String(daysVisited)} />
        <BookingMetric label="Upcoming" value={String(upcomingSessions.length)} tone="blue" />
        <BookingMetric label="Bookings" value={String(sorted.length)} />
      </div>

      <div className="mt-7 grid gap-4">
        {school.profileNotes ? (
          <div className="rounded-[14px] border border-[#f0d8a8] bg-[#fffaf0] px-4 py-3">
            <p className="text-xs font-semibold text-[#9a5a00]">Notes from the school</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[color:var(--navy)]">
              {school.profileNotes}
            </p>
          </div>
        ) : null}

        {sorted.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-[color:var(--border-soft)] bg-white/80 px-4 py-6 text-sm text-[color:var(--text-soft)]">
            No bookings on record for this school yet.
          </p>
        ) : null}

        {sorted.map((booking) => (
          <SchoolBookingCard
            key={booking.id}
            booking={booking}
            basePath={basePath}
            schoolAddress={schoolAddress}
          />
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Link
          href={`${basePath}/bookings?status=all&q=${encodeURIComponent(school.name)}`}
          className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-[8px] border border-[#c4dbfb] bg-white px-4 text-[12px] font-semibold text-[#1e4fae] transition hover:bg-[#f4f8ff]"
        >
          <CalendarDays className="h-4 w-4" />
          Manage on the bookings page
        </Link>
      </div>
    </BookingDialogShell>
  );
}

function SchoolBookingCard({
  booking,
  basePath,
  schoolAddress
}: {
  booking: BookingRequestView;
  basePath: string;
  schoolAddress?: string;
}) {
  const days = groupSameDaySessions(
    [...booking.sessions].sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  );

  return (
    <article className="overflow-hidden rounded-[18px] border border-[#cfd8e6] bg-white shadow-[0_8px_22px_rgba(11,24,77,0.06)]">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
          booking.status === "cancelled" ? "bg-[#f0f2f6]" : "bg-[#e6f4ea]"
        )}
      >
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <p className="text-base font-semibold text-[color:var(--navy)]">
            Booking {booking.referenceCode ? `#${booking.referenceCode}` : ""}
          </p>
          <p className="text-xs text-[#55617a]">Created {formatShortDate(booking.createdAt)}</p>
        </div>
        <StatusPill value={booking.status} />
      </div>

      <div className="grid divide-y divide-[#e3e9f2] border-b border-[#e3e9f2] md:auto-cols-fr md:grid-flow-col md:divide-x md:divide-y-0">
        <BookingDetail label="Contact" icon={UserRound}>
          <span className="font-semibold">{booking.primaryContactName || "No contact name"}</span>
        </BookingDetail>
        <BookingDetail label="Position" icon={BriefcaseBusiness}>{booking.primaryContactPosition || "Not recorded"}</BookingDetail>
        <BookingDetail label="Email" icon={Mail}>
          {booking.primaryContactEmail ? (
            <a
              href={`mailto:${booking.primaryContactEmail}`}
              className="block truncate text-[#1e4fae] hover:underline"
              title={booking.primaryContactEmail}
            >
              {booking.primaryContactEmail}
            </a>
          ) : (
            "Not recorded"
          )}
        </BookingDetail>
        {booking.sourcedByAmbassadorName ? (
          <BookingDetail label="Sourced by" icon={HeartHandshake}>{booking.sourcedByAmbassadorName}</BookingDetail>
        ) : null}
      </div>

      {booking.schoolNotes || booking.internalNotes ? (
        <div
          className={cn(
            "grid divide-y divide-[#e3e9f2] border-b border-[#e3e9f2]",
            booking.schoolNotes && booking.internalNotes && "md:grid-cols-2 md:divide-x md:divide-y-0"
          )}
        >
          {booking.schoolNotes ? <BookingDetail label="School notes" icon={MessageSquareText}>{booking.schoolNotes}</BookingDetail> : null}
          {booking.internalNotes ? <BookingDetail label="Internal notes" icon={StickyNote}>{booking.internalNotes}</BookingDetail> : null}
        </div>
      ) : null}

      <div className="grid gap-2.5 px-3 pb-3 pt-5">
        {days.length === 0 ? (
          <p className="px-1 py-3 text-sm text-[color:var(--text-soft)]">
            This request does not have any sessions attached yet.
          </p>
        ) : null}
        {days.map((sessions) => (
          <SchoolDayGroup
            key={sessions[0].id}
            sessions={sessions}
            basePath={basePath}
            schoolAddress={schoolAddress}
          />
        ))}
      </div>
    </article>
  );
}

const dayPaymentLabels: Record<PaymentStatus, string> = {
  not_eligible: "No payment",
  eligible: "Payment awaiting approval",
  pending: "Payment awaiting approval",
  approved: "Payment approved",
  paid: "Paid"
};
const dayPaymentPriority: PaymentStatus[] = ["paid", "approved", "pending", "eligible"];

// One report and one payment cover a day, so those live on the day, not on
// each session: the other sessions of the day carry no report or payment of
// their own, which isn't a problem worth showing.
function dayAdminSummary(sessions: BookingSessionView[]) {
  const report = sessions.some((session) => session.reportStatus === "reviewed")
    ? "Report reviewed"
    : sessions.some((session) => session.reportStatus === "submitted")
      ? "Report submitted"
      : "No report yet";
  const payment =
    dayPaymentPriority.find((status) => sessions.some((session) => session.paymentStatus === status)) ??
    "not_eligible";

  return `${report} · ${dayPaymentLabels[payment]}`;
}

const dayTileWeekday = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short" });
const dayTileDay = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric" });
const dayTileMonthYear = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  month: "short",
  year: "numeric"
});

function BookingDetail({
  label,
  icon: Icon,
  children
}: {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 px-4 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#55617a]">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <div className="mt-0.5 whitespace-pre-line text-sm leading-6 text-[color:var(--navy)]">{children}</div>
    </div>
  );
}

function SchoolDayGroup({
  sessions,
  basePath,
  schoolAddress
}: {
  sessions: BookingSessionView[];
  basePath: string;
  schoolAddress?: string;
}) {
  const active = sessions.filter((session) => !isCancelledSession(session));
  const delivered = sessions.filter((session) => isCountedPresentation(session));
  const isUpcoming = sessions.some((session) => isFutureSession(session));
  // A day's report records the whole day's attendance on one session, so
  // reported numbers are never added to the other sessions' expected numbers.
  const reported = active.filter((session) => session.actualStudentCount);
  const studentCount = (reported.length > 0 ? reported : active).reduce(
    (total, session) => total + Number(session.actualStudentCount ?? session.expectedStudentCount ?? 0),
    0
  );
  const sessionLabel = `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
  const studentLabel =
    studentCount > 0
      ? `${studentCount} student${studentCount === 1 ? "" : "s"}${reported.length > 0 ? "" : " expected"}`
      : null;
  const state =
    delivered.length > 0
      ? {
          label: delivered.length === sessions.length ? "Delivered" : `${delivered.length} of ${sessions.length} delivered`,
          tone: "bg-[#e5f6e9] text-[#117a2e]",
          tileTone: "bg-[#e5f6e9] text-[#117a2e]"
        }
      : active.length === 0
        ? { label: "Cancelled", tone: "bg-[#f0f2f5] text-[#64748b]", tileTone: "bg-[#f0f2f5] text-[#64748b]" }
        : isUpcoming
          ? { label: "Upcoming", tone: "bg-[#e8f0ff] text-[#1e4fae]", tileTone: "bg-[#e8f0ff] text-[#1e4fae]" }
          : { label: "Not completed", tone: "bg-[#fff3dd] text-[#9a5a00]", tileTone: "bg-[#fff3dd] text-[#9a5a00]" };
  const firstStart = new Date(sessions[0].startsAt);

  return (
    <section className="flex overflow-hidden rounded-[14px] border border-[#dbe2ec] bg-white">
      <div
        className={cn(
          "flex w-[4.75rem] shrink-0 flex-col items-center justify-center px-2 py-3 text-center",
          state.tileTone
        )}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
          {dayTileWeekday.format(firstStart)}
        </span>
        <span className="text-2xl font-semibold leading-tight tracking-[-0.03em]">
          {dayTileDay.format(firstStart)}
        </span>
        <span className="text-[11px] font-semibold">{dayTileMonthYear.format(firstStart)}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#edf1f6] px-3.5 py-2.5">
          <p className="min-w-0 text-sm text-[#55617a]">
            {[sessionLabel, studentLabel].filter(Boolean).join(" · ")}
            {delivered.length > 0 ? ` · ${dayAdminSummary(sessions)}` : ""}
          </p>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", state.tone)}>{state.label}</span>
        </div>

        <div className="divide-y divide-[#edf1f6]">
          {sessions.map((session) => (
            <SchoolSessionRow
              key={session.id}
              session={session}
              basePath={basePath}
              schoolAddress={schoolAddress}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function SchoolSessionRow({
  session,
  basePath,
  schoolAddress
}: {
  session: BookingSessionView;
  basePath: string;
  schoolAddress?: string;
}) {
  const isCancelled = isCancelledSession(session);
  const isDelivered = isCountedPresentation(session);
  const isUpcoming = isFutureSession(session);
  const location = session.locationAddress ?? session.schoolAddress;

  return (
    <div
      className={cn(
        "grid items-center gap-x-3 gap-y-1 bg-white px-3.5 py-2.5 md:grid-cols-[8.75rem_minmax(0,1fr)_minmax(0,10rem)_auto]",
        isCancelled && "opacity-60"
      )}
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
        {isDelivered ? (
          <CircleCheck className="h-4 w-4 shrink-0 text-[#18a83b]" aria-label="Delivered" />
        ) : isCancelled ? (
          <CircleMinus className="h-4 w-4 shrink-0 text-[#94a3b8]" aria-label="Cancelled" />
        ) : isUpcoming ? (
          <CalendarDays className="h-4 w-4 shrink-0 text-[#246bff]" aria-label="Upcoming" />
        ) : (
          <Hourglass className="h-4 w-4 shrink-0 text-[#c07a12]" aria-label="Not completed" />
        )}
        <span className={cn("whitespace-nowrap", isCancelled && "line-through")}>
          {formatTime(session.startsAt)}
        </span>
      </p>
      <div className="min-w-0">
        <p className="truncate text-sm text-[color:var(--navy)]">
          {session.presentationTitle}
          {session.deliveryMode === "online" ? " (online)" : ""}
        </p>
        <p className="text-xs text-[color:var(--text-soft)]">{session.yearLevels || "Year groups not recorded"}</p>
        {location && location !== schoolAddress ? (
          <p className="text-xs text-[color:var(--text-soft)]">{location}</p>
        ) : null}
      </div>
      {session.assignedAmbassadorId ? (
        <Link
          href={`${basePath}/ambassadors/${session.assignedAmbassadorId}`}
          className="truncate text-sm font-semibold text-[#1e4fae] hover:underline"
          title={session.assignedAmbassadorName}
        >
          {session.assignedAmbassadorName ?? "Ambassador"}
        </Link>
      ) : (
        <p className="truncate text-sm text-[color:var(--text-soft)]">Not assigned</p>
      )}
      <div className="flex items-center justify-end gap-2">
        {!isDelivered ? <StatusPill value={session.status} /> : null}
        <SessionDetailsButton session={session} label="View" />
      </div>
    </div>
  );
}

function BookingMetric({
  label,
  value,
  tone = "navy"
}: {
  label: string;
  value: string;
  tone?: "navy" | "green" | "blue";
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border px-3.5 py-2.5",
        tone === "green"
          ? "border-[#c9ead1] bg-[#f1fbf4]"
          : tone === "blue"
            ? "border-[#d7e6f7] bg-[#f3f8fd]"
            : "border-[color:var(--border-soft)] bg-white"
      )}
    >
      <p className="text-xs font-semibold text-[color:var(--text-soft)]">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">{value}</p>
    </div>
  );
}

function ToolbarSelect({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-[36px] rounded-[8px] border border-[color:var(--border-soft)] bg-white px-3 text-[12px] font-semibold text-[color:var(--navy)] outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function PageArrow({
  children,
  onClick,
  disabled,
  ariaLabel
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
