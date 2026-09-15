"use client";

import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek
} from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleX,
  Clock3,
  Eye,
  LayoutList,
  Leaf,
  Mail,
  MapPin,
  Search,
  UserRound,
  X
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { createPortal } from "react-dom";

import { SessionChangeSummary } from "@/components/dashboard/session-change-summary";
import { SessionDetailsButton } from "@/components/dashboard/session-details-dialog";
import type { BookingRequestView, BookingSessionView } from "@/lib/domain/types";
import { colourWithAlpha } from "@/lib/presentation-colors";
import { cn, formatShortDate, formatTime, titleCase } from "@/lib/utils";

const PAGE_SIZE = 10;

function paginationItems(currentPage: number, pageCount: number) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const visiblePages = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);

  if (currentPage <= 4) {
    [2, 3, 4, 5].forEach((page) => visiblePages.add(page));
  }

  if (currentPage >= pageCount - 3) {
    [pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1].forEach((page) =>
      visiblePages.add(page)
    );
  }

  const pages = [...visiblePages]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((left, right) => left - right);
  const items: Array<number | string> = [];

  pages.forEach((page, index) => {
    const previousPage = pages[index - 1];

    if (previousPage && page - previousPage > 1) {
      items.push(`ellipsis-${previousPage}`);
    }

    items.push(page);
  });

  return items;
}

const BOOKING_STATUS_OPTIONS = [
  ["requested", "Pending"],
  ["tentative", "Tentative"],
  ["applied", "Applied"],
  ["ambassador_assigned", "Ambassador assigned"],
  ["confirmed", "Confirmed"],
  ["reschedule_requested", "Reschedule requested"],
  ["closed", "Completed"],
  ["cancelled", "Cancelled"],
  ["declined", "Declined"]
] as const;

// Statuses that mean "this booking has been delivered" — not selectable while
// any of the booking's sessions are still in the future.
const COMPLETION_STATUSES = new Set([
  "completed_pending_report",
  "report_submitted",
  "payment_pending",
  "paid",
  "closed"
]);

function schoolBookingStatus(status: string) {
  return COMPLETION_STATUSES.has(status) ? "closed" : status;
}

const statusPillStyles: Record<string, string> = {
  tentative: "bg-[#f1f3f6] text-[#667085]",
  applied: "bg-[#e8f1fd] text-[#1e4fae]",
  ambassador_assigned: "bg-[#f1edfd] text-[#6941c6]",
  withdrawal_requested: "bg-[#fff8d9] text-[#8a6500]",
  confirmed: "bg-[#eaf8ee] text-[#117a2e]",
  completed_pending_report: "bg-[#eef0ff] text-[#4c5bd4]",
  report_submitted: "bg-[#e6f7fb] text-[#087f8c]",
  payment_pending: "bg-[#fff7e6] text-[#9b6100]",
  paid: "bg-[#e4f7ed] text-[#087443]",
  closed: "bg-[#e6f7f4] text-[#087f6a]",
  cancelled: "bg-[#fdecec] text-[#b3372e]",
  declined: "bg-[#f5eaf0] text-[#8b2c58]",
  reschedule_requested: "bg-[#fff0e4] text-[#b54708]",
  requested: "bg-[#fff5df] text-[#9a5a00]"
};

const bookingStatusControlStyles: Record<string, string> = {
  requested: "border-[#f2ddb0] bg-[#fff5df] text-[#9a5a00]",
  tentative: "border-[#d7dce4] bg-[#f1f3f6] text-[#667085]",
  applied: "border-[#c4dbfb] bg-[#e8f1fd] text-[#1e4fae]",
  ambassador_assigned: "border-[#d9cef7] bg-[#f1edfd] text-[#6941c6]",
  confirmed: "border-[#bfe6ca] bg-[#eaf8ee] text-[#117a2e]",
  reschedule_requested: "border-[#f2cfb3] bg-[#fff0e4] text-[#b54708]",
  withdrawal_requested: "border-[#eadb91] bg-[#fff8d9] text-[#8a6500]",
  cancelled: "border-[#f0c3c0] bg-[#fdecec] text-[#a8322b]",
  declined: "border-[#e6c5d5] bg-[#f5eaf0] text-[#8b2c58]",
  completed_pending_report: "border-[#ced3fa] bg-[#eef0ff] text-[#4c5bd4]",
  report_submitted: "border-[#bee6ed] bg-[#e6f7fb] text-[#087f8c]",
  payment_pending: "border-[#efd9aa] bg-[#fff7e6] text-[#9b6100]",
  paid: "border-[#b9e5ce] bg-[#e4f7ed] text-[#087443]",
  closed: "border-[#b9e4dd] bg-[#e6f7f4] text-[#087f6a]"
};

const bookingStatusIconStyles: Record<string, string> = {
  requested: "text-[#9a5a00]",
  tentative: "text-[#667085]",
  applied: "text-[#1e4fae]",
  ambassador_assigned: "text-[#6941c6]",
  confirmed: "text-[#117a2e]",
  reschedule_requested: "text-[#b54708]",
  closed: "text-[#087f6a]",
  cancelled: "text-[#b3372e]",
  declined: "text-[#8b2c58]"
};

type CalendarTone = "green" | "blue" | "amber" | "red" | "grey";

const calendarToneStyles: Record<CalendarTone, string> = {
  green: "border-[#bfe6d2] bg-[#eaf8ee] text-[#117a2e] hover:bg-[#dff2e5]",
  blue: "border-[#c4dbfb] bg-[#e8f1fd] text-[#1e4fae] hover:bg-[#dcebfc]",
  amber: "border-[#f2ddb0] bg-[#fff5df] text-[#9a5a00] hover:bg-[#fbedcb]",
  red: "border-[#f3c1c1] bg-[#fdecec] text-[#b3372e] hover:bg-[#fbdfdf]",
  grey: "border-[color:var(--border-soft)] bg-[#f1f5f9] text-[#64748b] hover:bg-[#e8eef5]"
};

function subscribeToHashChange(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function calendarTone(status: string): CalendarTone {
  if (["ambassador_assigned", "confirmed", "report_submitted", "paid", "closed"].includes(status)) {
    return "green";
  }

  if (["cancelled", "declined"].includes(status)) {
    return "red";
  }

  if (["reschedule_requested", "withdrawal_requested"].includes(status)) {
    return "amber";
  }

  if (
    [
      "requested",
      "tentative",
      "applied",
      "completed_pending_report",
      "payment_pending"
    ].includes(status)
  ) {
    return "grey";
  }

  return "blue";
}

export function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        statusPillStyles[value] ?? "bg-[#f1f5f9] text-[#64748b]"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value === "requested" ? "Pending" : value === "closed" ? "Completed" : titleCase(value)}
    </span>
  );
}

function AutoSaveBookingStatus({
  currentStatus,
  options,
  compact = false
}: {
  currentStatus: string;
  options: ReadonlyArray<readonly [string, string]>;
  compact?: boolean;
}) {
  const { pending } = useFormStatus();
  const displayStatus = schoolBookingStatus(currentStatus);
  const isCancelled = ["cancelled", "declined"].includes(displayStatus);
  const isCompleted = [
    "ambassador_assigned",
    "confirmed",
    "closed"
  ].includes(displayStatus);

  return (
    <label className="grid w-full min-w-0 justify-items-start gap-1">
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]",
          compact && "sr-only"
        )}
      >
        Booking status
      </span>
      <span className="relative block w-full min-w-0">
        <span
          className={cn(
            "pointer-events-none absolute inset-y-0 left-2.5 z-10 flex items-center",
            bookingStatusIconStyles[displayStatus] ?? "text-[#667085]"
          )}
        >
          {isCancelled ? (
            <CircleX className="h-3.5 w-3.5" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Clock3 className="h-3.5 w-3.5" />
          )}
        </span>
        <select
          name="status"
          defaultValue={displayStatus}
          disabled={pending}
          aria-busy={pending}
          style={compact ? { fontSize: "13px", lineHeight: "1.15" } : undefined}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className={cn(
            "w-full min-w-0 appearance-none rounded-[9px] border pl-8 pr-7 font-semibold outline-none transition-colors",
            compact ? "min-h-[34px]" : "min-h-[40px] text-sm",
            bookingStatusControlStyles[displayStatus] ??
              "border-[color:var(--border-soft)] bg-white text-[color:var(--navy)]",
            pending && "cursor-wait opacity-60"
          )}
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
      </span>
      <span className="sr-only" aria-live="polite">
        {pending ? "Saving booking status" : ""}
      </span>
    </label>
  );
}

function BulkStatusSubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[38px] items-center justify-center rounded-[10px] bg-[#246bff] px-4 text-xs font-semibold text-white transition hover:bg-[#1d5ce0] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Updating…" : `Update ${count} booking${count === 1 ? "" : "s"}`}
    </button>
  );
}

export function BookingsExplorer({
  bookings,
  allBookings,
  basePath,
  activeView,
  range,
  customRange,
  ambassadors,
  presentationTitles,
  updateStatusAction,
  bulkUpdateStatusAction,
  assignAmbassadorAction,
  resolveWithdrawalAction,
  resolveRescheduleAction,
  initialQuery,
  initialBookingId
}: {
  bookings: BookingRequestView[];
  allBookings: BookingRequestView[];
  basePath: string;
  activeView: string;
  range: string;
  customRange?: { from: string; to: string } | null;
  ambassadors: Array<{ id: string; name: string }>;
  presentationTitles: string[];
  updateStatusAction: (formData: FormData) => void | Promise<void>;
  bulkUpdateStatusAction: (formData: FormData) => void | Promise<void>;
  assignAmbassadorAction: (formData: FormData) => void | Promise<void>;
  resolveWithdrawalAction: (formData: FormData) => void | Promise<void>;
  resolveRescheduleAction: (formData: FormData) => void | Promise<void>;
  initialQuery?: string;
  initialBookingId?: string;
}) {
  // Deep links like /bookings?q=School+Name (e.g. "View bookings" on the
  // schools page) land pre-filtered on the list view. Deep links with
  // ?booking=<id> (notifications, post-update redirects) land on the list
  // view with that booking's card expanded and its page selected.
  const initialBookingIndex = initialBookingId
    ? bookings.findIndex((booking) => booking.id === initialBookingId)
    : -1;
  const [viewMode, setViewMode] = useState<"calendar" | "list">("list");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [regionFilter, setRegionFilter] = useState("all");
  const [presentationFilter, setPresentationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(
    initialBookingIndex >= 0 ? Math.floor(initialBookingIndex / PAGE_SIZE) + 1 : 1
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    initialBookingId ? { [initialBookingId]: true } : {}
  );
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(() => new Set());
  // After a status update or assignment, the server action redirects back to
  // #booking-{id}, so the page scrolls to and re-expands the card in question
  // instead of jumping to the top.
  const activeHash = useSyncExternalStore(
    subscribeToHashChange,
    () => window.location.hash,
    () => ""
  );

  const bookingQuery = (status: string) => {
    const searchParams = new URLSearchParams({ status, range });

    if (customRange) {
      searchParams.set("from", customRange.from);
      searchParams.set("to", customRange.to);
    }

    return `${basePath}/bookings?${searchParams.toString()}`;
  };
  const returnTo = bookingQuery(activeView);
  const nowMs = new Date().getTime();
  const regionOptions = useMemo(
    () => Array.from(new Set(allBookings.map((booking) => booking.regionSlug))).sort(),
    [allBookings]
  );

  const matchesFilters = (booking: BookingRequestView) => {
    const normalized = query.trim().toLowerCase();
    const haystack = [
      booking.schoolName,
      booking.referenceCode ?? "",
      booking.primaryContactName,
      booking.primaryContactEmail,
      booking.sessions.map((session) => session.presentationTitle).join(" ")
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!normalized || haystack.includes(normalized)) &&
      (regionFilter === "all" || booking.regionSlug === regionFilter) &&
      (presentationFilter === "all" ||
        booking.sessions.some((session) => session.presentationTitle === presentationFilter)) &&
      (statusFilter === "all" || schoolBookingStatus(booking.status) === statusFilter)
    );
  };

  const filtered = useMemo(
    () => bookings.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, query, regionFilter, presentationFilter, statusFilter]
  );

  const calendarSessions = useMemo(
    () =>
      allBookings
        .filter(matchesFilters)
        .flatMap((booking) =>
          booking.sessions.map((session) => ({ session, schoolName: booking.schoolName }))
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allBookings, query, regionFilter, presentationFilter, statusFilter]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageBookings = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const visiblePaginationItems = paginationItems(safePage, pageCount);
  const allPageBookingsSelected =
    pageBookings.length > 0 && pageBookings.every((booking) => selectedBookingIds.has(booking.id));
  const selectedBookings = allBookings.filter((booking) => selectedBookingIds.has(booking.id));
  const selectedHaveFutureSessions = selectedBookings.some((booking) =>
    booking.sessions.some(
      (session) =>
        new Date(session.endsAt).getTime() > nowMs &&
        session.status !== "cancelled" &&
        session.status !== "declined"
    )
  );
  const bulkStatusOptions = BOOKING_STATUS_OPTIONS.filter(
    ([value]) => !selectedHaveFutureSessions || !COMPLETION_STATUSES.has(value)
  );
  const hasActiveFilters =
    query !== "" || regionFilter !== "all" || presentationFilter !== "all" || statusFilter !== "all";

  const isExpanded = (bookingId: string) =>
    expanded[bookingId] ?? activeHash === `#booking-${bookingId}`;

  return (
    <div
      id="bookings-panel"
      className="surface-panel grid scroll-mt-24 gap-0 overflow-hidden rounded-[24px]"
    >
      {/* ------------------------------------------------ filter toolbar */}
      <div className="grid gap-3 border-b border-[color:rgba(4,15,75,0.08)] p-3.5 md:p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex shrink-0 overflow-hidden rounded-[14px] border border-[color:var(--border-soft)] bg-white">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-2 px-3.5 text-sm font-semibold transition",
                viewMode === "calendar"
                  ? "bg-[color:var(--green-soft)] text-[#117a2e]"
                  : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-2 border-l border-[color:var(--border-soft)] px-3.5 text-sm font-semibold transition",
                viewMode === "list"
                  ? "bg-[color:var(--green-soft)] text-[#117a2e]"
                  : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
              )}
            >
              <LayoutList className="h-4 w-4" />
              List
            </button>
          </div>

        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_repeat(3,minmax(150px,190px))_auto] xl:items-end">
          <label className="flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)] sm:col-span-2 xl:col-span-1">
            <Search className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search bookings, schools, or contacts..."
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
            />
          </label>

          <ToolbarSelect
            label="Region"
            value={regionFilter}
            onChange={(value) => {
              setRegionFilter(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All regions" },
              ...regionOptions.map((slug) => ({ value: slug, label: titleCase(slug) }))
            ]}
          />
          <ToolbarSelect
            label="Presentation type"
            value={presentationFilter}
            onChange={(value) => {
              setPresentationFilter(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All types" },
              ...presentationTitles.map((title) => ({ value: title, label: title }))
            ]}
          />
          <ToolbarSelect
            label="Status"
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All statuses" },
              ...BOOKING_STATUS_OPTIONS.map(([value, label]) => ({ value, label }))
            ]}
          />
          <button
            type="button"
            disabled={!hasActiveFilters}
            onClick={() => {
              setQuery("");
              setRegionFilter("all");
              setPresentationFilter("all");
              setStatusFilter("all");
              setPage(1);
            }}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 text-sm font-semibold text-[color:var(--navy)] transition disabled:opacity-40"
          >
            Clear
          </button>
        </div>

        {viewMode === "list" && selectedBookingIds.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#c8dafb] bg-[#f4f8ff] px-3.5 py-3">
            <p className="text-sm font-semibold text-[color:var(--navy)]">
              {selectedBookingIds.size} booking{selectedBookingIds.size === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <form action={bulkUpdateStatusAction} className="flex flex-wrap items-center gap-2">
                {[...selectedBookingIds].map((bookingRequestId) => (
                  <input
                    key={bookingRequestId}
                    type="hidden"
                    name="bookingRequestId"
                    value={bookingRequestId}
                  />
                ))}
                <input type="hidden" name="returnTo" value={`${returnTo}#bookings-panel`} />
                <label className="sr-only" htmlFor="bulk-booking-status">
                  New status for selected bookings
                </label>
                <select
                  id="bulk-booking-status"
                  name="status"
                  defaultValue="requested"
                  className="min-h-[38px] rounded-[10px] border border-[color:var(--border-soft)] bg-white px-3 text-xs font-semibold text-[color:var(--navy)] outline-none"
                >
                  {bulkStatusOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <BulkStatusSubmitButton count={selectedBookingIds.size} />
              </form>
              <button
                type="button"
                onClick={() => setSelectedBookingIds(new Set())}
                className="inline-flex min-h-[38px] items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white px-3 text-xs font-semibold text-[color:var(--navy)]"
              >
                Clear selection
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {viewMode === "calendar" ? (
        <BookingsCalendar
          entries={calendarSessions}
          updateStatusAction={updateStatusAction}
          resolveWithdrawalAction={resolveWithdrawalAction}
          resolveRescheduleAction={resolveRescheduleAction}
          returnTo={`${returnTo}#bookings-panel`}
        />
      ) : (
        <>
          {/* ------------------------------------------------ booking cards */}
          {pageBookings.length === 0 ? (
            <div className="px-6 py-10 text-sm text-[color:var(--text-soft)]">
              No bookings match this view or those filters yet.
            </div>
          ) : null}

          <div className="max-w-full overflow-hidden">
          <div className="hidden grid-cols-[32px_125px_170px_minmax(180px,1fr)_minmax(200px,1.05fr)_minmax(160px,0.8fr)_minmax(150px,0.8fr)_145px] items-center gap-6 bg-[#f6f9fd] py-3.5 pl-6 pr-9 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] 2xl:grid">
            <input
              type="checkbox"
              checked={allPageBookingsSelected}
              onChange={(event) => {
                const checked = event.target.checked;
                setSelectedBookingIds((current) => {
                  const next = new Set(current);

                  pageBookings.forEach((booking) => {
                    if (checked) {
                      next.add(booking.id);
                    } else {
                      next.delete(booking.id);
                    }
                  });

                  return next;
                });
              }}
              aria-label="Select all bookings on this page"
              className="h-4 w-4 rounded border-[color:var(--border-soft)] accent-[#18a83b]"
            />
            <span>Date</span>
            <span>Status</span>
            <span className="pl-2.5">School</span>
            <span>Contact</span>
            <span>Presentation</span>
            <span>Location</span>
            <span>Actions</span>
          </div>
          {pageBookings.map((booking) => {
            const open = isExpanded(booking.id);
            const primarySession = booking.sessions[0];
            const uniquePresentations = Array.from(
              new Set(booking.sessions.map((session) => session.presentationTitle))
            );
            const sessionLocation = primarySession?.locationAddress?.trim();
            const locationSlug =
              booking.regionSlug !== "unassigned"
                ? booking.regionSlug
                : primarySession?.regionSlug;
            const locationLabel =
              locationSlug === "other" || locationSlug === "other-request-region"
                ? sessionLocation && !/^new zealand$/i.test(sessionLocation)
                  ? sessionLocation
                  : "Other location"
                : locationSlug && locationSlug !== "unassigned"
                  ? primarySession?.regionName ?? titleCase(locationSlug)
                  : sessionLocation || "Location not recorded";
            // The booking param makes the server render the list view with
            // this card expanded, so the #booking anchor exists on load.
            const cardReturnTo = `${returnTo}&booking=${booking.id}#booking-${booking.id}`;
            // Future bookings can't be marked delivered — hide those options.
            const hasFutureSession = booking.sessions.some(
              (session) =>
                new Date(session.endsAt).getTime() > nowMs &&
                session.status !== "cancelled" &&
                session.status !== "declined"
            );
            const statusOptions = BOOKING_STATUS_OPTIONS.filter(
              ([value]) =>
                !hasFutureSession ||
                !COMPLETION_STATUSES.has(value) ||
                value === schoolBookingStatus(booking.status)
            );
            return (
              <section
                key={booking.id}
                id={`booking-${booking.id}`}
                className="grid scroll-mt-24 gap-0 border-t border-[color:rgba(4,15,75,0.08)]"
              >
                <div
                  className={cn(
                    "relative grid min-w-0 gap-x-6 gap-y-5 bg-white py-5 pl-12 pr-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[32px_125px_170px_minmax(180px,1fr)_minmax(200px,1.05fr)_minmax(160px,0.8fr)_minmax(150px,0.8fr)_145px] 2xl:items-center 2xl:gap-6 2xl:py-5 2xl:pl-6 2xl:pr-9",
                    open && "bg-[#fbfdff]"
                  )}
                >
                  <div className="absolute left-4 top-5 2xl:static">
                    <input
                      type="checkbox"
                      checked={selectedBookingIds.has(booking.id)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelectedBookingIds((current) => {
                          const next = new Set(current);

                          if (checked) {
                            next.add(booking.id);
                          } else {
                            next.delete(booking.id);
                          }

                          return next;
                        });
                      }}
                      aria-label={`Select ${booking.schoolName}`}
                      className="h-4 w-4 rounded border-[color:var(--border-soft)] accent-[#18a83b]"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)] 2xl:hidden">
                      Date
                    </p>
                    {primarySession ? (
                      <p className="text-[13px] font-semibold text-[color:var(--navy)]">
                        {formatShortDate(primarySession.startsAt)}
                        <span className="mt-1 block whitespace-nowrap text-[11px] font-medium text-[color:var(--text-soft)]">
                          {formatTime(primarySession.startsAt)} – {formatTime(primarySession.endsAt)}
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm text-[color:var(--text-soft)]">No session date</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)] 2xl:hidden">
                      Status
                    </p>
                    <form action={updateStatusAction} className="min-w-0">
                      <input type="hidden" name="bookingRequestId" value={booking.id} />
                      <input type="hidden" name="returnTo" value={cardReturnTo} />
                      <AutoSaveBookingStatus
                        currentStatus={booking.status}
                        options={statusOptions}
                        compact
                      />
                    </form>
                  </div>

                  <div className="min-w-0 2xl:pl-2.5">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)] 2xl:hidden">
                      School
                    </p>
                    <h3 className="text-[13px] font-semibold leading-5 text-[color:var(--navy)]">
                      {booking.schoolName}
                    </h3>
                    {booking.referenceCode ? (
                      <p className="mt-1 text-[11px] text-[color:var(--text-soft)]">
                        Ref {booking.referenceCode}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)] 2xl:hidden">
                      Contact
                    </p>
                    <p className="truncate text-[13px] font-medium text-[color:var(--navy)]">
                      {booking.primaryContactName}
                    </p>
                    <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-[color:var(--text-soft)]">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{booking.primaryContactEmail}</span>
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)] 2xl:hidden">
                      Presentation
                    </p>
                    {uniquePresentations.length > 0 ? (
                      <span className="inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-[color:var(--green-soft)] px-2.5 py-1 text-[11px] font-semibold text-[#117a2e]">
                        <Leaf className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{uniquePresentations[0]}</span>
                        {uniquePresentations.length > 1 ? ` +${uniquePresentations.length - 1}` : ""}
                      </span>
                    ) : (
                      <p className="text-sm text-[color:var(--text-soft)]">Not selected</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)] 2xl:hidden">
                      Location
                    </p>
                    <p className="flex items-start gap-1.5 text-[12px] leading-5 text-[color:var(--navy)]">
                      <MapPin className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                      <span>{locationLabel}</span>
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)] 2xl:hidden">
                      Actions
                    </p>
                    <button
                      type="button"
                      style={{ fontSize: "13px", lineHeight: "1.15" }}
                      onClick={() => setExpanded((current) => ({ ...current, [booking.id]: !open }))}
                      aria-expanded={open}
                      aria-controls={`booking-sessions-${booking.id}`}
                      className="inline-flex min-h-[34px] w-full min-w-0 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[9px] border border-[#8db1ff] bg-white px-2 font-semibold text-[#2563eb] transition hover:bg-[#f7faff] sm:w-auto 2xl:w-full"
                    >
                      {open ? "Hide sessions" : "View sessions"}
                      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {open ? (
                  <>
                    <div
                      id={`booking-sessions-${booking.id}`}
                      className="mx-3 mb-3 mt-2 rounded-[16px] border border-[color:var(--border-soft)] bg-[#f8fbff] p-3.5 shadow-[0_10px_24px_rgba(11,24,77,0.04)]"
                    >
                      <p className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                        <CalendarDays className="h-4 w-4 text-[color:var(--text-soft)]" />
                        Requested sessions
                      </p>
                      <div className="mt-3 grid gap-2 2xl:hidden">
                        {booking.sessions.map((session) => (
                          <CompactSessionCard
                            key={session.id}
                            session={session}
                            ambassadors={ambassadors}
                            assignAmbassadorAction={assignAmbassadorAction}
                            updateStatusAction={updateStatusAction}
                            resolveWithdrawalAction={resolveWithdrawalAction}
                            resolveRescheduleAction={resolveRescheduleAction}
                            returnTo={cardReturnTo}
                          />
                        ))}
                      </div>
                      <div className="mt-3 hidden overflow-x-auto rounded-[14px] border border-[color:var(--border-soft)] bg-white 2xl:block">
                        <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0">
                        <colgroup>
                          <col className="w-[9%]" />
                          <col className="w-[13%]" />
                          <col className="w-[19%]" />
                          <col className="w-[26%]" />
                          <col className="w-[8%]" />
                          <col className="w-[12%]" />
                          <col className="w-[13%]" />
                        </colgroup>
                        <thead>
                          <tr>
                            {[
                              "Date & time",
                              "Presentation",
                              "Year groups",
                              "Ambassador",
                              "Students",
                              "Status",
                              "Actions"
                            ].map((heading) => (
                              <th
                                key={heading}
                                className="border-b border-[color:rgba(4,15,75,0.08)] bg-[#f6f9fd] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]"
                              >
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {booking.sessions.map((session) => (
                            <Fragment key={session.id}>
                            <tr className="align-middle">
                              <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-3.5">
                                <span className="flex items-center gap-2.5 text-sm font-semibold text-[color:var(--navy)]">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#e8f1fd] text-[#2563eb]">
                                    <CalendarDays className="h-4 w-4" />
                                  </span>
                                  <span>
                                    {formatShortDate(session.startsAt)}
                                    <span className="block text-sm font-medium text-[color:var(--text-soft)]">
                                      {formatTime(session.startsAt)}
                                    </span>
                                  </span>
                                </span>
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5">
                                <span className="flex items-center gap-2.5 text-sm font-semibold" style={{ color: session.presentationAccentColor ?? "#117a2e" }}>
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: colourWithAlpha(session.presentationAccentColor ?? "#18A83B", 0.1), color: session.presentationAccentColor ?? "#117a2e" }}>
                                    <Leaf className="h-4 w-4" />
                                  </span>
                                  {session.presentationTitle}
                                </span>
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5 text-sm leading-5 text-[color:var(--text-soft)]">
                                {session.yearLevels}
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5">
                                <form
                                  action={assignAmbassadorAction}
                                  className="flex min-w-0 items-start gap-2"
                                >
                                  <input type="hidden" name="bookingSessionId" value={session.id} />
                                  <input type="hidden" name="returnTo" value={cardReturnTo} />
                                  <AmbassadorSearchSelect
                                    ambassadors={ambassadors}
                                    applicants={session.applicants ?? []}
                                    assignedId={session.assignedAmbassadorId}
                                    assignedName={session.assignedAmbassadorName}
                                  />
                                  <button
                                    type="submit"
                                    className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-[9px] border border-[#75a2ff] bg-white px-3 text-xs font-semibold text-[#2563eb] shadow-[0_6px_14px_rgba(37,99,235,0.08)] transition hover:bg-[#f4f8ff]"
                                  >
                                    Assign
                                  </button>
                                </form>
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5 text-sm font-semibold text-[color:var(--navy)]">
                                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-[9px] bg-[#e8f1fd] px-2.5 text-[#2563eb]">
                                  {session.actualStudentCount ?? session.expectedStudentCount}
                                </span>
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5">
                                <StatusPill value={session.status} />
                                <SessionChangeSummary session={session} compact />
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5">
                                <SessionDetailsButton
                                  session={session}
                                  className="min-h-[36px] rounded-[9px] border-[#dbe6f5] px-3 py-1 text-xs font-semibold text-[#2563eb]"
                                  label={
                                    <>
                                      <Eye className="h-3.5 w-3.5" />
                                      Details
                                    </>
                                  }
                                  updateStatusAction={updateStatusAction}
                                  resolveWithdrawalAction={resolveWithdrawalAction}
                                  resolveRescheduleAction={resolveRescheduleAction}
                                  returnTo={cardReturnTo}
                                />
                              </td>
                            </tr>
                            {session.status === "withdrawal_requested" ? (
                              <tr>
                                <td colSpan={7} className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                                  <WithdrawalReviewPanel
                                    session={session}
                                    action={resolveWithdrawalAction}
                                    returnTo={cardReturnTo}
                                  />
                                </td>
                              </tr>
                            ) : null}
                            </Fragment>
                          ))}
                        </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : null}
              </section>
            );
          })}
          </div>

          {/* ------------------------------------------------ pagination */}
          {filtered.length > 0 ? (
            <div className="grid gap-3 border-t border-[color:rgba(4,15,75,0.08)] px-4 py-3.5 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[color:var(--navy)]">
                  Page {safePage} of {pageCount}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--text-soft)]">
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{" "}
                  {filtered.length} booking request{filtered.length === 1 ? "" : "s"}
                </p>
              </div>
              <nav aria-label="Booking pages" className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <PageArrow
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                  ariaLabel="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </PageArrow>
                {visiblePaginationItems.map((item) =>
                  typeof item === "number" ? (
                    <button
                      key={item}
                      type="button"
                      aria-current={item === safePage ? "page" : undefined}
                      aria-label={`Go to page ${item}`}
                      onClick={() => setPage(item)}
                      className={cn(
                        "flex h-9 min-w-9 shrink-0 items-center justify-center rounded-[10px] border px-2 text-sm font-semibold transition",
                        item === safePage
                          ? "border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                          : "border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] hover:border-[rgba(37,99,235,0.25)] hover:bg-[#f7faff]"
                      )}
                    >
                      {item}
                    </button>
                  ) : (
                    <span
                      key={item}
                      aria-hidden="true"
                      className="flex h-9 w-7 shrink-0 items-center justify-center text-sm font-semibold text-[color:var(--text-soft)]"
                    >
                      …
                    </span>
                  )
                )}
                <PageArrow
                  disabled={safePage >= pageCount}
                  onClick={() => setPage(safePage + 1)}
                  ariaLabel="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </PageArrow>
              </nav>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function CompactSessionCard({
  session,
  ambassadors,
  assignAmbassadorAction,
  updateStatusAction,
  resolveWithdrawalAction,
  resolveRescheduleAction,
  returnTo
}: {
  session: BookingSessionView;
  ambassadors: Array<{ id: string; name: string }>;
  assignAmbassadorAction: (formData: FormData) => void | Promise<void>;
  updateStatusAction: (formData: FormData) => void | Promise<void>;
  resolveWithdrawalAction: (formData: FormData) => void | Promise<void>;
  resolveRescheduleAction: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  return (
    <article className="rounded-[14px] border border-[color:var(--border-soft)] bg-white p-3.5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#e8f1fd] text-[#2563eb]">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[color:var(--navy)]">
              {formatShortDate(session.startsAt)} · {formatTime(session.startsAt)}
            </p>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-semibold" style={{ color: session.presentationAccentColor ?? "#117a2e" }}>
              <Leaf className="h-4 w-4 shrink-0" />
              <span className="truncate">{session.presentationTitle}</span>
            </p>
          </div>
        </div>
        <StatusPill value={session.status} />
      </div>

      <SessionChangeSummary session={session} compact />

      <dl className="mt-3 grid gap-2 rounded-[11px] bg-[#f7f9fc] p-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
            Year groups
          </dt>
          <dd className="mt-1 text-sm text-[color:var(--navy)]">{session.yearLevels}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
            Students
          </dt>
          <dd className="mt-1 text-sm font-semibold text-[color:var(--navy)]">
            {session.actualStudentCount ?? session.expectedStudentCount}
          </dd>
        </div>
      </dl>

      <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="min-w-0">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
            Ambassador
          </p>
          <form
            action={assignAmbassadorAction}
            className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <input type="hidden" name="bookingSessionId" value={session.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <AmbassadorSearchSelect
              ambassadors={ambassadors}
              applicants={session.applicants ?? []}
              assignedId={session.assignedAmbassadorId}
              assignedName={session.assignedAmbassadorName}
            />
            <button
              type="submit"
              className="inline-flex min-h-[36px] items-center justify-center rounded-[9px] border border-[#75a2ff] bg-white px-3 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f4f8ff]"
            >
              Assign
            </button>
          </form>
        </div>
        <SessionDetailsButton
          session={session}
          className="min-h-[36px] w-full rounded-[9px] border-[#dbe6f5] px-3 py-1 text-xs font-semibold text-[#2563eb] xl:w-auto"
          label={
            <>
              <Eye className="h-3.5 w-3.5" />
              Details
            </>
          }
          updateStatusAction={updateStatusAction}
          resolveWithdrawalAction={resolveWithdrawalAction}
          resolveRescheduleAction={resolveRescheduleAction}
          returnTo={returnTo}
        />
      </div>

      {session.status === "withdrawal_requested" ? (
        <div className="mt-3">
          <WithdrawalReviewPanel
            session={session}
            action={resolveWithdrawalAction}
            returnTo={returnTo}
          />
        </div>
      ) : null}
    </article>
  );
}

function WithdrawalReviewPanel({
  session,
  action,
  returnTo
}: {
  session: BookingSessionView;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#f2ddb0] bg-[#fff8e8] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#9a5a00]">
            {session.assignedAmbassadorName ?? "Ambassador"} asked to withdraw
          </p>
          <p className="mt-1 text-sm leading-6 text-[#8f680f]">
            {session.withdrawalReason ? `"${session.withdrawalReason}"` : "No reason provided."}
          </p>
          {session.withdrawalRequestedAt ? (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a5a00]">
              Requested {formatShortDate(session.withdrawalRequestedAt)}
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:min-w-[380px]">
          <form action={action}>
            <input type="hidden" name="bookingSessionId" value={session.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="decision" value="approve" />
            <button
              type="submit"
              className="inline-flex min-h-[42px] w-full items-center justify-center rounded-[14px] border border-[#18a83b] bg-[#18a83b] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(24,168,59,0.2)] transition hover:bg-[#12852f]"
            >
              Approve withdrawal - reopen session
            </button>
          </form>
          <form action={action} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input type="hidden" name="bookingSessionId" value={session.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="decision" value="decline" />
            <input
              name="note"
              placeholder="Reply to the ambassador..."
              className="min-h-[42px] rounded-[14px] border border-[#f2ddb0] bg-white px-3 text-sm text-[color:var(--navy)] outline-none"
            />
            <button
              type="submit"
              className="inline-flex min-h-[42px] items-center justify-center rounded-[14px] border border-[#f2ddb0] bg-white px-4 text-sm font-semibold text-[#9a5a00] transition hover:bg-[#fff2d8]"
            >
              Decline - keep assigned
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar view                                                       */
/* ------------------------------------------------------------------ */

function BookingsCalendar({
  entries,
  updateStatusAction,
  resolveWithdrawalAction,
  resolveRescheduleAction,
  returnTo
}: {
  entries: Array<{ session: BookingSessionView; schoolName: string }>;
  updateStatusAction: (formData: FormData) => void | Promise<void>;
  resolveWithdrawalAction: (formData: FormData) => void | Promise<void>;
  resolveRescheduleAction: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const today = new Date();
  const gridStart = startOfWeek(viewMonth, { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const monthLabel = format(viewMonth, "MMMM yyyy");
  const monthCount = entries.filter((entry) =>
    isSameMonth(new Date(entry.session.startsAt), viewMonth)
  ).length;

  const legend: Array<{ tone: CalendarTone; label: string }> = [
    { tone: "green", label: "Confirmed / delivered" },
    { tone: "blue", label: "Assigned / applied" },
    { tone: "amber", label: "Tentative / awaiting assignment" },
    { tone: "red", label: "Cancelled" }
  ];

  return (
    <div className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMonth((current) => addMonths(current, -1))}
            aria-label="Previous month"
            className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMonth(startOfMonth(new Date()))}
            className="inline-flex min-h-[40px] items-center justify-center rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm font-semibold text-[color:var(--navy)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setViewMonth((current) => addMonths(current, 1))}
            aria-label="Next month"
            className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h3 className="ml-2 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
            {monthLabel}
          </h3>
          <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-semibold text-[#64748b]">
            {monthCount} session{monthCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {legend.map((item) => (
            <span key={item.tone} className="inline-flex items-center gap-1.5 text-xs text-[color:var(--text-soft)]">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full border",
                  calendarToneStyles[item.tone].split(" ").slice(0, 2).join(" ")
                )}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-7 gap-px rounded-t-[14px] border border-b-0 border-[color:var(--border-soft)] bg-[#f6f9fd] text-center">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span
                key={day}
                className="px-2 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
              >
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 overflow-hidden rounded-b-[14px] border border-[color:var(--border-soft)] bg-[color:var(--border-soft)] gap-px">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const isToday = isSameDay(day, today);
              const isWeekend = [0, 6].includes(day.getDay());
              const dailySessions = entries
                .filter((entry) => isSameDay(new Date(entry.session.startsAt), day))
                .sort(
                  (a, b) =>
                    new Date(a.session.startsAt).getTime() - new Date(b.session.startsAt).getTime()
                );

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[112px] bg-white p-1.5",
                    isWeekend && "bg-[#fafcfe]",
                    !inMonth && "bg-[#f6f8fb]"
                  )}
                >
                  <span
                    className={cn(
                      "ml-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      isToday
                        ? "bg-[#2563eb] text-white"
                        : inMonth
                          ? "text-[color:var(--navy)]"
                          : "text-[color:var(--text-soft)]"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <div className="mt-1 grid gap-1">
                    {dailySessions.map(({ session, schoolName }) => (
                      <SessionDetailsButton
                        key={session.id}
                        session={session}
                        unstyled
                        updateStatusAction={updateStatusAction}
                        resolveWithdrawalAction={resolveWithdrawalAction}
                        resolveRescheduleAction={resolveRescheduleAction}
                        returnTo={returnTo}
                        className={cn(
                          "w-full truncate rounded-[8px] border px-1.5 py-1 text-left text-[11px] font-semibold leading-4 transition",
                          calendarToneStyles[calendarTone(session.status)]
                        )}
                        label={
                          <>
                            {formatTime(session.startsAt)} · {schoolName.replace(/^Demo\s+/i, "")}
                          </>
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-[color:var(--text-soft)]">
        Click any session for full details, contact info, and assignment status. Empty days show
        where the gaps are.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ambassador typeahead                                                */
/* ------------------------------------------------------------------ */

function AmbassadorSearchSelect({
  ambassadors,
  applicants,
  assignedId,
  assignedName
}: {
  ambassadors: Array<{ id: string; name: string }>;
  applicants: Array<{ id: string; name: string }>;
  assignedId?: string;
  assignedName?: string;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState(assignedName ?? "");
  const [selectedId, setSelectedId] = useState(assignedId ?? "");
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const open = position !== null;

  const openPopover = () => {
    const rect = anchorRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    setPosition({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: Math.max(rect.width, 260)
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      setPosition(null);
    };

    // Coalesced to one rAF per frame so scroll events don't thrash layout.
    let rafId = 0;

    const reposition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();

      if (!rect) {
        setPosition(null);
        return;
      }

      setPosition({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        width: Math.max(rect.width, 260)
      });
    };

    const scheduleReposition = () => {
      if (rafId) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        reposition();
      });
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", scheduleReposition, { capture: true, passive: true });
    window.addEventListener("resize", scheduleReposition);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", scheduleReposition, { capture: true });
      window.removeEventListener("resize", scheduleReposition);
      window.cancelAnimationFrame(rafId);
    };
  }, [open]);

  const normalized = text.trim().toLowerCase();
  const applicantIds = new Set(applicants.map((applicant) => applicant.id));
  const matchingApplicants = applicants.filter(
    (applicant) => !normalized || applicant.name.toLowerCase().includes(normalized)
  );
  const others = ambassadors.filter(
    (ambassador) =>
      !applicantIds.has(ambassador.id) &&
      (!normalized || ambassador.name.toLowerCase().includes(normalized))
  );

  const select = (ambassador: { id: string; name: string }) => {
    setSelectedId(ambassador.id);
    setText(ambassador.name);
    setPosition(null);
  };

  return (
    <div ref={anchorRef} className="relative min-w-0 flex-1">
      <input type="hidden" name="ambassadorProfileId" value={selectedId} />
      <div className="flex items-center gap-2 rounded-[10px] border border-[color:var(--border-soft)] bg-white px-3">
        <Search className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
        <input
          value={text}
          onFocus={openPopover}
          onClick={openPopover}
          onChange={(event) => {
            setText(event.target.value);
            setSelectedId("");

            if (!open) {
              openPopover();
            }
          }}
          placeholder={assignedName ?? "Search ambassadors..."}
          className="min-h-[34px] min-w-0 flex-1 bg-transparent text-xs text-[color:var(--navy)] outline-none placeholder:text-[color:var(--text-soft)]"
        />
        {text ? (
          <button
            type={assignedName ? "submit" : "button"}
            name={assignedName ? "ambassadorProfileId" : undefined}
            value={assignedName ? "" : undefined}
            onClick={() => {
              if (!assignedName) {
                setText("");
                setSelectedId("");
              }
            }}
            aria-label={assignedName ? "Unassign ambassador" : "Clear ambassador"}
            title={assignedName ? "Unassign ambassador" : "Clear ambassador"}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--text-soft)] transition hover:bg-[#f1f5f9] hover:text-[color:var(--navy)]"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {assignedName || applicants.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {assignedName ? (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#c4dbfb] bg-[#e8f1fd] px-2 py-0.5 text-[10px] font-semibold text-[#1e4fae]">
              <UserRound className="h-3 w-3 shrink-0" />
              <span className="shrink-0">Assigned:</span>
              <span className="truncate">{assignedName}</span>
            </span>
          ) : null}
          {applicants.map((applicant) => (
            <button
              key={applicant.id}
              type="button"
              onClick={() => select(applicant)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-[rgba(24,168,59,0.24)] bg-[color:var(--green-soft)] px-2 py-0.5 text-[10px] font-semibold text-[#117a2e] transition hover:bg-[#dff2e5]"
            >
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{applicant.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              style={{ top: position.top, left: position.left, width: position.width }}
              className="fixed z-[90] max-h-[300px] overflow-y-auto rounded-[16px] border border-[color:var(--border-soft)] bg-white p-1.5 shadow-[0_24px_54px_rgba(11,24,77,0.18)]"
            >
              {matchingApplicants.length > 0 ? (
                <>
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                    Applied for this session
                  </p>
                  {matchingApplicants.map((applicant) => (
                    <button
                      key={applicant.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => select(applicant)}
                      className="flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-sm text-[color:var(--navy)] transition hover:bg-[color:var(--green-soft)]"
                    >
                      <span className="truncate font-medium">{applicant.name}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color:var(--green-soft)] px-2 py-0.5 text-[10px] font-semibold text-[#117a2e]">
                        <CheckCircle2 className="h-3 w-3" />
                        Applied
                      </span>
                    </button>
                  ))}
                </>
              ) : null}

              {others.length > 0 ? (
                <>
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                    All approved ambassadors
                  </p>
                  {others.map((ambassador) => (
                    <button
                      key={ambassador.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => select(ambassador)}
                      className="flex w-full items-center rounded-[10px] px-2.5 py-2 text-left text-sm text-[color:var(--navy)] transition hover:bg-[#f4f8ff]"
                    >
                      <span className="truncate">{ambassador.name}</span>
                    </button>
                  ))}
                </>
              ) : null}

              {matchingApplicants.length === 0 && others.length === 0 ? (
                <p className="px-2.5 py-3 text-sm text-[color:var(--text-soft)]">
                  No ambassadors match that name.
                </p>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ToolbarSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[44px] w-full min-w-0 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm font-semibold text-[color:var(--navy)] outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PageArrow({
  children,
  onClick,
  disabled,
  ariaLabel
}: {
  children: React.ReactNode;
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
