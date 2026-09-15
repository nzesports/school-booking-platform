"use client";

import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
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
  Phone,
  Search,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { StatusPill } from "@/components/dashboard/bookings-explorer";
import { SessionDetailsButton } from "@/components/dashboard/session-details-dialog";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import type { BookingRequestView, School } from "@/lib/domain/types";
import { cn, formatShortDate, formatTime, titleCase } from "@/lib/utils";

const PAGE_SIZE = 8;
const completedSessionStatuses = new Set([
  "completed_pending_report",
  "report_submitted",
  "payment_pending",
  "paid",
  "closed"
]);
const upcomingSessionStatuses = new Set([
  "requested",
  "tentative",
  "applied",
  "ambassador_assigned",
  "confirmed",
  "withdrawal_requested",
  "reschedule_requested"
]);
const schoolTableColumns = [
  { label: "School", width: "20%" },
  { label: "Contact", width: "17%" },
  { label: "Region", width: "8%" },
  { label: "Delivered", width: "10%" },
  { label: "Presentations", width: "12%" },
  { label: "Year groups", width: "9%" },
  { label: "Last session", width: "8%" },
  { label: "Next session", width: "10%" },
  { label: "Bookings", width: "6%" }
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
              "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[12px] px-4 text-sm font-semibold transition",
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
        <label className="flex min-h-[52px] min-w-[240px] flex-1 items-center gap-2.5 rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
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
          <div className="overflow-hidden rounded-[20px] border border-[color:var(--border-soft)] bg-white">
        <table className="w-full table-fixed border-separate border-spacing-0">
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
                  className="whitespace-nowrap border-b border-[color:rgba(4,15,75,0.08)] bg-[#f6f9fd] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
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
                        <span
                          className="block truncate font-semibold text-[color:var(--navy)]"
                          title={summary.school.name}
                        >
                          {summary.school.name}
                        </span>
                        <span
                          className="block truncate text-xs text-[color:var(--text-soft)]"
                          title={summary.contactName ?? summary.school.city}
                        >
                          {summary.contactName ?? summary.school.city}
                        </span>
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
                            <span className="truncate">{summary.school.contactEmail}</span>
                          </a>
                        ) : null}
                        {summary.school.contactPhone ? (
                          <a
                            href={`tel:${summary.school.contactPhone}`}
                            className="flex min-w-0 items-center gap-1.5 text-xs text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
                            title={summary.school.contactPhone}
                          >
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{summary.school.contactPhone}</span>
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
                    <span
                      className="block truncate"
                      title={
                        regionNameBySlug.get(summary.school.regionSlug) ??
                        summary.school.regionSlug
                      }
                    >
                      {regionNameBySlug.get(summary.school.regionSlug) ??
                        summary.school.regionSlug}
                    </span>
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
                              <span className="truncate">{title}</span>
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
                      <span className="truncate">{yearGroups.label}</span>
                    </span>
                  </td>
                  <td className="overflow-hidden border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--navy)]">
                    {delivered ? (
                      <span className="block truncate" title={summary.lastDeliveredLabel}>
                        {summary.lastDeliveredLabel}
                      </span>
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
                        <span className="truncate">{summary.nextSessionLabel}</span>
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
                      className="inline-flex min-h-[32px] items-center justify-center gap-1 whitespace-nowrap rounded-[10px] border border-[#c4dbfb] bg-white px-2.5 text-[11px] font-semibold text-[#1e4fae] transition hover:bg-[#f4f8ff]"
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
                  "flex h-9 min-w-9 items-center justify-center rounded-[10px] border px-2 text-sm font-semibold transition",
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
            className="w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)]"
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
            className="inline-flex min-h-[46px] items-center justify-center rounded-[16px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)]"
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
  const deliveredSessions = sessions.filter((session) =>
    completedSessionStatuses.has(session.status)
  );
  const upcomingSessions = sessions.filter((session) =>
    upcomingSessionStatuses.has(session.status)
  );

  return (
    <BookingDialogShell
      kicker="School bookings"
      title={school.name}
      description={`${sorted.length} booking request${sorted.length === 1 ? "" : "s"} and ${sessions.length} session${sessions.length === 1 ? "" : "s"} on record`}
      onClose={onClose}
      maxWidthClassName="max-w-[980px]"
      overlayClassName="z-[80]"
      compact
    >
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <BookingMetric label="Booking requests" value={String(sorted.length)} />
        <BookingMetric label="Sessions" value={String(sessions.length)} />
        <BookingMetric label="Delivered" value={String(deliveredSessions.length)} tone="green" />
        <BookingMetric label="Upcoming" value={String(upcomingSessions.length)} tone="blue" />
      </div>

      <div className="mt-4 grid gap-4">
        {school.profileNotes ? (
          <div className="rounded-[16px] border border-[#f0d8a8] bg-[#fffaf0] px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a5a00]">
              Notes from the school
            </p>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-[color:var(--navy)]">
              {school.profileNotes}
            </p>
          </div>
        ) : null}

        {sorted.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-[color:var(--border-soft)] bg-white/80 px-4 py-6 text-sm text-[color:var(--text-soft)]">
            No bookings on record for this school yet.
          </p>
        ) : null}

        {sorted.map((booking) => (
          <article
            key={booking.id}
            className="overflow-hidden rounded-[22px] border border-[color:var(--border-soft)] bg-white/92"
          >
            <div className="border-b border-[color:rgba(4,15,75,0.07)] bg-[#fbfcfe] p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-[color:var(--navy)]">
                    {titleCase(booking.source)} request
                    {booking.referenceCode ? ` · ${booking.referenceCode}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                    Created {formatShortDate(booking.createdAt)}
                  </p>
                </div>
                <StatusPill value={booking.status} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <BookingMeta label="School contact">
                  <p className="truncate font-semibold text-[color:var(--navy)]">
                    {booking.primaryContactName || "No contact name"}
                  </p>
                  {booking.primaryContactEmail ? (
                    <a
                      href={`mailto:${booking.primaryContactEmail}`}
                      className="mt-0.5 block truncate text-[#1e4fae] hover:underline"
                      title={booking.primaryContactEmail}
                    >
                      {booking.primaryContactEmail}
                    </a>
                  ) : (
                    <p className="mt-0.5 text-[color:var(--text-soft)]">No contact email</p>
                  )}
                </BookingMeta>
                <BookingMeta label="Booking source">
                  <p className="font-semibold text-[color:var(--navy)]">
                    {titleCase(booking.source)}
                  </p>
                  <p className="mt-0.5 truncate text-[color:var(--text-soft)]">
                    {booking.sourcedByAmbassadorName
                      ? `Sourced by ${booking.sourcedByAmbassadorName}`
                      : "No ambassador sourcing attribution"}
                  </p>
                </BookingMeta>
              </div>

              {booking.schoolNotes || booking.internalNotes ? (
                <div className="mt-3 grid gap-1.5 rounded-[14px] border border-[#e7ebf1] bg-white px-3.5 py-3 text-xs leading-5 text-[color:var(--text-soft)]">
                  {booking.schoolNotes ? (
                    <p>
                      <span className="font-semibold text-[color:var(--navy)]">School notes: </span>
                      {booking.schoolNotes}
                    </p>
                  ) : null}
                  {booking.internalNotes ? (
                    <p>
                      <span className="font-semibold text-[color:var(--navy)]">Internal notes: </span>
                      {booking.internalNotes}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 p-4 md:p-5">
              {booking.sessions.length === 0 ? (
                <p className="rounded-[16px] border border-dashed border-[color:var(--border-soft)] px-4 py-5 text-sm text-[color:var(--text-soft)]">
                  This request does not have any sessions attached yet.
                </p>
              ) : null}

              {[...booking.sessions]
                .sort(
                  (left, right) =>
                    new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
                )
                .map((session) => (
                <section
                  key={session.id}
                  className="rounded-[18px] border border-[color:var(--border-soft)] bg-[#f8fafc] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[color:var(--navy)]">
                        {session.presentationTitle}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                        {formatShortDate(session.startsAt)} · {formatTime(session.startsAt)}–{formatTime(session.endsAt)}
                      </p>
                    </div>
                    <StatusPill value={session.status} />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SessionFact
                      label="Presenting ambassador"
                      value={session.assignedAmbassadorName ?? "Not assigned yet"}
                      detail={session.assignedAmbassadorEmail ?? session.assignedAmbassadorPhone}
                      href={
                        session.assignedAmbassadorId
                          ? `${basePath}/ambassadors/${session.assignedAmbassadorId}`
                          : undefined
                      }
                    />
                    <SessionFact
                      label="Students"
                      value={`${session.actualStudentCount ?? session.expectedStudentCount} student${(session.actualStudentCount ?? session.expectedStudentCount) === 1 ? "" : "s"}`}
                      detail={session.actualStudentCount ? "Actual attendance" : "Expected attendance"}
                    />
                    <SessionFact label="Year groups" value={session.yearLevels || "Not recorded"} />
                    <SessionFact
                      label="Administration"
                      value={`Report: ${titleCase(session.reportStatus)}`}
                      detail={`Payment: ${titleCase(session.paymentStatus)}`}
                    />
                  </div>

                  {session.locationAddress || session.schoolAddress ? (
                    <p className="mt-3 flex min-w-0 items-start gap-2 rounded-[12px] bg-white px-3 py-2 text-xs leading-5 text-[color:var(--text-soft)]">
                      <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--navy)]" />
                      <span>{session.locationAddress ?? session.schoolAddress}</span>
                    </p>
                  ) : null}

                  <div className="mt-3 flex justify-end">
                    <SessionDetailsButton
                      session={session}
                      className="min-h-[32px] rounded-[10px] px-2.5 py-1 text-xs"
                    />
                  </div>
                </section>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Link
          href={`${basePath}/bookings?status=all&q=${encodeURIComponent(school.name)}`}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#c4dbfb] bg-white px-4 text-sm font-semibold text-[#1e4fae] transition hover:bg-[#f4f8ff]"
        >
          <CalendarDays className="h-4 w-4" />
          Manage on the bookings page
        </Link>
      </div>
    </BookingDialogShell>
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
        "rounded-[16px] border px-4 py-3",
        tone === "green"
          ? "border-[#c9ead1] bg-[#f1fbf4]"
          : tone === "blue"
            ? "border-[#d7e6f7] bg-[#f3f8fd]"
            : "border-[color:var(--border-soft)] bg-white"
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {value}
      </p>
    </div>
  );
}

function BookingMeta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 py-3 text-xs">
      <p className="mb-1.5 font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </p>
      {children}
    </div>
  );
}

function SessionFact({
  label,
  value,
  detail,
  href
}: {
  label: string;
  value: string;
  detail?: string;
  href?: string;
}) {
  return (
    <div className="min-w-0 rounded-[13px] bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </p>
      {href ? (
        <Link
          href={href}
          className="mt-1 block truncate text-sm font-semibold text-[#1e4fae] hover:underline"
          title={value}
        >
          {value}
        </Link>
      ) : (
        <p className="mt-1 truncate text-sm font-semibold text-[color:var(--navy)]" title={value}>
          {value}
        </p>
      )}
      {detail ? (
        <p className="mt-0.5 truncate text-xs text-[color:var(--text-soft)]" title={detail}>
          {detail}
        </p>
      ) : null}
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
      className="min-h-[52px] rounded-[16px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm font-semibold text-[color:var(--navy)] outline-none"
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
