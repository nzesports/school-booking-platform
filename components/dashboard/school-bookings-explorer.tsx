"use client";

import { CalendarClock, CalendarDays, CheckCircle2, Eye, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { StatusBadge, schoolBookingStatusLabel } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import type { BookingSessionView } from "@/lib/domain/types";
import { colourWithAlpha } from "@/lib/presentation-colors";
import { cn, formatShortDate, formatTime } from "@/lib/utils";

export type SchoolSessionRow = {
  session: BookingSessionView;
  bookingId: string;
  isDelivered: boolean;
  hasReview: boolean;
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "tentative", label: "Pending approval" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" }
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

const reschedulableStatuses = new Set([
  "requested",
  "tentative",
  "applied",
  "ambassador_assigned",
  "confirmed"
]);

function rowMatchesFilter(row: SchoolSessionRow, filter: FilterValue) {
  if (filter === "all") {
    return true;
  }

  if (filter === "completed") {
    return row.isDelivered;
  }

  if (filter === "confirmed") {
    return !row.isDelivered && (row.session.status === "confirmed" || row.session.status === "ambassador_assigned");
  }

  return (
    !row.isDelivered &&
    row.session.status !== "confirmed" &&
    row.session.status !== "ambassador_assigned" &&
    row.session.status !== "cancelled"
  );
}

export function SchoolBookingsExplorer({ rows }: { rows: SchoolSessionRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return rows.filter((row) => {
      const haystack = [
        row.session.presentationTitle,
        row.session.assignedAmbassadorName ?? "",
        row.session.yearLevels
      ]
        .join(" ")
        .toLowerCase();

      return (!normalized || haystack.includes(normalized)) && rowMatchesFilter(row, filter);
    });
  }, [rows, query, filter]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[44px] min-w-[220px] flex-1 items-center gap-2.5 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm text-[color:var(--navy)]">
          <Search className="h-4 w-4 text-[color:var(--text-soft)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions..."
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
          />
        </label>

        <div className="flex flex-wrap gap-1 rounded-[14px] border border-[color:var(--border-soft)] bg-white p-1">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                "inline-flex min-h-[36px] items-center justify-center rounded-[11px] px-3.5 text-sm font-semibold transition",
                option.value === filter
                  ? "border border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                  : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

      </div>

      <div className="overflow-x-auto rounded-[18px] border border-[color:var(--border-soft)] bg-white">
        <table className="min-w-[920px] border-separate border-spacing-0 lg:min-w-full">
          <thead>
            <tr>
              {["Presentation", "Date & time", "Status", "Ambassador", "Actions", "Review"].map((heading) => (
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
            {filtered.map((row) => (
              <tr key={row.session.id} className="align-middle">
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ backgroundColor: colourWithAlpha(row.session.presentationAccentColor ?? "#18A83B", 0.1), color: row.session.presentationAccentColor ?? "#18A83B" }}>
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <span className="font-semibold" style={{ color: row.session.presentationAccentColor ?? "var(--navy)" }}>
                      {row.session.presentationTitle}
                    </span>
                  </span>
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--navy)]">
                  {formatShortDate(row.session.startsAt, true)} · {formatTime(row.session.startsAt)}
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                  <StatusBadge
                    value={row.isDelivered ? "completed" : row.session.status}
                    label={schoolBookingStatusLabel(
                      row.isDelivered ? "completed" : row.session.status
                    )}
                  />
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--navy)]">
                  {row.session.assignedAmbassadorName ?? "Pending assignment"}
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                  <span className="flex flex-wrap items-center gap-2">
                    <ButtonLink
                      href={`/school/bookings/${row.bookingId}`}
                      className="min-h-[36px] rounded-[12px] px-3 py-1"
                    >
                      <Eye className="h-4 w-4" />
                      View details
                    </ButtonLink>
                    {!row.isDelivered && reschedulableStatuses.has(row.session.status) ? (
                      <ButtonLink
                        href={`/school/bookings/${row.bookingId}/sessions/${row.session.id}/reschedule`}
                        variant="ghost"
                        className="min-h-[36px] rounded-[12px] px-3 py-1"
                      >
                        <CalendarClock className="h-4 w-4" />
                        Reschedule
                      </ButtonLink>
                    ) : null}
                  </span>
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                  {row.hasReview ? (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#117a2e]">
                      <CheckCircle2 className="h-4 w-4" />
                      Submitted
                    </span>
                  ) : row.isDelivered ? (
                    <ButtonLink
                      href={`/school/review/${row.session.id}`}
                      variant="secondary"
                      className="min-h-[36px] rounded-[12px] px-3 py-1"
                    >
                      <Star className="h-4 w-4" />
                      Leave feedback
                    </ButtonLink>
                  ) : (
                    <span className="text-xs font-medium text-[color:var(--text-soft)]">
                      After presentation
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-sm text-[color:var(--text-soft)]">
            No sessions match that search or filter yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
