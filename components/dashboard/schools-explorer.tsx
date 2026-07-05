"use client";

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
  Info,
  Landmark,
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

export function SchoolsExplorer({
  summaries,
  regions,
  bookings,
  basePath
}: {
  summaries: SchoolDeliverySummary[];
  regions: Array<{ slug: string; name: string }>;
  bookings: BookingRequestView[];
  basePath: string;
}) {
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

  const schoolsWithBookings = summaries.filter(
    (summary) => summary.deliveredCount + summary.upcomingCount > 0
  ).length;
  const sessionsDelivered = summaries.reduce((total, summary) => total + summary.deliveredCount, 0);
  const upcomingSessions = summaries.reduce((total, summary) => total + summary.upcomingCount, 0);

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
        summary.presentationsDelivered.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return (
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
  }, [summaries, query, regionFilter, presentationFilter, sortBy, regionNameBySlug]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageSummaries = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="grid gap-5">
      {/* ------------------------------------------------ stat tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          icon={<Landmark className="h-6 w-6" />}
          iconClassName="bg-[#eef2f8] text-[color:var(--navy)]"
          label="Schools with bookings"
          value={String(schoolsWithBookings)}
        />
        <StatTile
          icon={<CircleCheck className="h-6 w-6" />}
          iconClassName="bg-[#e6f5ec] text-[#117a2e]"
          label="Sessions delivered"
          value={String(sessionsDelivered)}
        />
        <StatTile
          icon={<CalendarDays className="h-6 w-6" />}
          iconClassName="bg-[#fdf3dc] text-[#b7822c]"
          label="Upcoming school sessions"
          value={String(upcomingSessions)}
        />
      </div>

      {/* ------------------------------------------------ toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[52px] min-w-[240px] flex-1 items-center gap-2.5 rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
          <Search className="h-4 w-4 text-[color:var(--text-soft)]" />
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

      {/* ------------------------------------------------ info strip */}
      <p className="flex items-center gap-2.5 rounded-[14px] bg-[#eef4fd] px-4 py-3 text-sm font-medium text-[#1e4fae]">
        <Info className="h-4 w-4 shrink-0" />
        This directory shows delivery history and upcoming bookings for every school on record.
      </p>

      {/* ------------------------------------------------ table */}
      <div className="overflow-x-auto rounded-[20px] border border-[color:var(--border-soft)] bg-white">
        <table className="min-w-[980px] border-separate border-spacing-0 lg:min-w-full">
          <thead>
            <tr>
              {[
                "School",
                "Region",
                "Delivered",
                "Presentations",
                "Year groups reached",
                "Last session",
                "Next session",
                "Bookings"
              ].map((heading) => (
                <th
                  key={heading}
                  className="border-b border-[color:rgba(4,15,75,0.08)] bg-[#f6f9fd] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageSummaries.map((summary) => {
              const delivered = summary.deliveredCount > 0;

              return (
                <tr key={summary.school.id} className="align-middle">
                  <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef2f8] text-[color:var(--navy)]">
                        <Landmark className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[color:var(--navy)]">
                          {summary.school.name}
                        </span>
                        <span className="block truncate text-xs text-[color:var(--text-soft)]">
                          {summary.contactName ?? summary.school.city}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--navy)]">
                    {regionNameBySlug.get(summary.school.regionSlug) ??
                      summary.school.regionSlug}
                  </td>
                  <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    <span className="flex items-center gap-2.5">
                      {delivered ? (
                        <CircleCheck className="h-5 w-5 shrink-0 text-[#18a83b]" />
                      ) : (
                        <CircleMinus className="h-5 w-5 shrink-0 text-[#94a3b8]" />
                      )}
                      <span>
                        <span className="block text-sm font-medium text-[color:var(--navy)]">
                          {summary.deliveredCount} session{summary.deliveredCount === 1 ? "" : "s"}
                        </span>
                        <span className="block text-xs text-[color:var(--text-soft)]">
                          {delivered ? `Last: ${summary.lastDeliveredLabel}` : "Not yet delivered"}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    {summary.presentationsDelivered.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {summary.presentationsDelivered.map((title) => {
                          const style = presentationChipStyle(title);
                          const ChipIcon = style.icon;

                          return (
                            <span
                              key={title}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                                style.chip
                              )}
                            >
                              <ChipIcon className="h-3.5 w-3.5" />
                              {title}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#64748b]">
                        <Hourglass className="h-3 w-3" />
                        Not yet delivered
                      </span>
                    )}
                  </td>
                  <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    {summary.yearGroupsReached.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {summary.yearGroupsReached.map((year) => (
                          <span
                            key={year}
                            className="inline-flex rounded-[8px] bg-[#e8f1fd] px-2 py-0.5 text-xs font-bold text-[#1e4fae]"
                          >
                            Y{year}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#64748b]">
                        Not recorded yet
                      </span>
                    )}
                  </td>
                  <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--navy)]">
                    {delivered ? (
                      summary.lastDeliveredLabel
                    ) : (
                      <span className="text-[color:var(--text-soft)]">Not yet delivered</span>
                    )}
                  </td>
                  <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                    {summary.nextSessionAt ? (
                      <span className="flex items-center gap-2 text-sm font-medium text-[color:var(--navy)]">
                        <CalendarDays className="h-4 w-4 shrink-0 text-[#18a83b]" />
                        {summary.nextSessionLabel}
                      </span>
                    ) : (
                      <span className="text-sm text-[color:var(--text-soft)]">None scheduled</span>
                    )}
                  </td>
                  <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
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

  return (
    <BookingDialogShell
      kicker="School bookings"
      title={school.name}
      description={`${sorted.length} booking request${sorted.length === 1 ? "" : "s"} on record`}
      onClose={onClose}
      maxWidthClassName="max-w-[760px]"
      overlayClassName="z-[80]"
      compact
    >
      <div className="mt-5 grid gap-3">
        {sorted.length === 0 ? (
          <p className="rounded-[16px] border border-dashed border-[color:var(--border-soft)] bg-white/80 px-4 py-6 text-sm text-[color:var(--text-soft)]">
            No bookings on record for this school yet.
          </p>
        ) : null}

        {sorted.map((booking) => (
          <div
            key={booking.id}
            className="rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[color:var(--navy)]">
                  {titleCase(booking.source)} request · {formatShortDate(booking.createdAt)}
                </p>
                <p className="text-xs text-[color:var(--text-soft)]">
                  {booking.primaryContactName} · {booking.primaryContactEmail}
                </p>
              </div>
              <StatusPill value={booking.status} />
            </div>

            <div className="mt-3 grid gap-1.5">
              {booking.sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[#f6f9fd] px-3 py-2"
                >
                  <span className="min-w-0 text-sm text-[color:var(--navy)]">
                    <span className="font-semibold">{session.presentationTitle}</span>
                    <span className="text-[color:var(--text-soft)]">
                      {" "}
                      · {formatShortDate(session.startsAt)} · {formatTime(session.startsAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusPill value={session.status} />
                    <SessionDetailsButton
                      session={session}
                      className="min-h-[32px] rounded-[10px] px-2.5 py-1 text-xs"
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
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

function StatTile({
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
    <div className="flex items-center gap-4 rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 p-5">
      <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-full", iconClassName)}>
        {icon}
      </span>
      <span>
        <span className="block text-sm text-[color:var(--text-soft)]">{label}</span>
        <span className="block text-3xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {value}
        </span>
      </span>
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
