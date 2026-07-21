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
  ClipboardList,
  Eye,
  Globe2,
  LayoutList,
  Leaf,
  Mail,
  MapPin,
  Search,
  School2,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { SessionDetailsButton } from "@/components/dashboard/session-details-dialog";
import type { BookingRequestView, BookingSessionView } from "@/lib/domain/types";
import { cn, formatShortDate, formatTime, titleCase } from "@/lib/utils";

const PAGE_SIZE = 4;

const BOOKING_STATUS_OPTIONS = [
  ["tentative", "Tentative"],
  ["ambassador_needed", "Ambassador needed"],
  ["ambassador_assigned", "Ambassador assigned"],
  ["confirmed", "Confirmed"],
  ["reschedule_requested", "Reschedule requested"],
  ["cancel_requested", "Cancel requested"],
  ["completed_pending_report", "Delivered, report needed"],
  ["report_submitted", "Report submitted"],
  ["paid", "Paid"],
  ["closed", "Closed"],
  ["cancelled", "Cancelled"],
  ["declined", "Declined"]
] as const;

// Statuses that mean "this booking has been delivered" — not selectable while
// any of the booking's sessions are still in the future.
const COMPLETION_STATUSES = new Set([
  "completed_pending_report",
  "report_submitted",
  "paid",
  "closed"
]);

const statusPillStyles: Record<string, string> = {
  tentative: "bg-[#fff5df] text-[#9a5a00]",
  ambassador_needed: "bg-[#fff5df] text-[#9a5a00]",
  ambassador_applied: "bg-[#e8f1fd] text-[#1e4fae]",
  ambassador_assigned: "bg-[#e8f1fd] text-[#1e4fae]",
  withdrawal_requested: "bg-[#fff5df] text-[#9a5a00]",
  confirmed: "bg-[#eaf8ee] text-[#117a2e]",
  completed_pending_report: "bg-[#e8f1fd] text-[#1e4fae]",
  report_submitted: "bg-[#eaf8ee] text-[#117a2e]",
  paid: "bg-[#eaf8ee] text-[#117a2e]",
  closed: "bg-[#f1f5f9] text-[#64748b]",
  cancelled: "bg-[#fdecec] text-[#b3372e]",
  declined: "bg-[#fdecec] text-[#b3372e]",
  reschedule_requested: "bg-[#fff5df] text-[#9a5a00]",
  cancel_requested: "bg-[#fdecec] text-[#b3372e]",
  requested: "bg-[#fff5df] text-[#9a5a00]"
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
  if (["confirmed", "report_submitted", "paid"].includes(status)) {
    return "green";
  }

  if (["cancelled", "declined", "cancel_requested"].includes(status)) {
    return "red";
  }

  if (
    ["tentative", "ambassador_needed", "reschedule_requested", "withdrawal_requested", "requested"].includes(status)
  ) {
    return "amber";
  }

  if (status === "closed") {
    return "grey";
  }

  return "blue";
}

export function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        statusPillStyles[value] ?? "bg-[#f1f5f9] text-[#64748b]"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {titleCase(value)}
    </span>
  );
}

export function BookingsExplorer({
  bookings,
  allBookings,
  basePath,
  activeView,
  range,
  lifecycleTabs,
  ambassadors,
  presentationTitles,
  updateStatusAction,
  removeInternalNoteAction,
  assignAmbassadorAction,
  resolveWithdrawalAction,
  initialQuery,
  initialBookingId
}: {
  bookings: BookingRequestView[];
  allBookings: BookingRequestView[];
  basePath: string;
  activeView: string;
  range: string;
  lifecycleTabs: Array<{ value: string; label: string }>;
  ambassadors: Array<{ id: string; name: string }>;
  presentationTitles: string[];
  updateStatusAction: (formData: FormData) => void | Promise<void>;
  removeInternalNoteAction: (formData: FormData) => void | Promise<void>;
  assignAmbassadorAction: (formData: FormData) => void | Promise<void>;
  resolveWithdrawalAction: (formData: FormData) => void | Promise<void>;
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
  const [viewMode, setViewMode] = useState<"calendar" | "list">(
    initialQuery || initialBookingIndex >= 0 ? "list" : "calendar"
  );
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
  // After a status update or assignment, the server action redirects back to
  // #booking-{id}, so the page scrolls to and re-expands the card in question
  // instead of jumping to the top.
  const activeHash = useSyncExternalStore(
    subscribeToHashChange,
    () => window.location.hash,
    () => ""
  );

  const returnTo = `${basePath}/bookings?status=${activeView}&range=${range}`;
  const nowMs = new Date().getTime();
  const regionOptions = useMemo(
    () => Array.from(new Set(allBookings.map((booking) => booking.regionSlug))).sort(),
    [allBookings]
  );

  const matchesFilters = (booking: BookingRequestView) => {
    const normalized = query.trim().toLowerCase();
    const haystack = [
      booking.schoolName,
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
      (statusFilter === "all" || booking.status === statusFilter)
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
  const hasActiveFilters =
    query !== "" || regionFilter !== "all" || presentationFilter !== "all" || statusFilter !== "all";

  const isExpanded = (bookingId: string, index: number) =>
    expanded[bookingId] ??
    (activeHash === `#booking-${bookingId}` || (!activeHash && safePage === 1 && index === 0));

  return (
    <div id="bookings-panel" className="grid scroll-mt-24 gap-5">
      {/* ------------------------------------------------ filter toolbar */}
      <div className="surface-panel flex flex-wrap items-end gap-3 rounded-[24px] p-4">
        <div className="flex overflow-hidden rounded-[14px] border border-[color:var(--border-soft)] bg-white">
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={cn(
              "inline-flex min-h-[48px] items-center gap-2 px-4 text-sm font-semibold transition",
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
              "inline-flex min-h-[48px] items-center gap-2 border-l border-[color:var(--border-soft)] px-4 text-sm font-semibold transition",
              viewMode === "list"
                ? "bg-[color:var(--green-soft)] text-[#117a2e]"
                : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
            )}
          >
            <LayoutList className="h-4 w-4" />
            List
          </button>
        </div>

        {viewMode === "list" ? (
          <div className="flex flex-wrap gap-1.5 rounded-[16px] border border-[color:var(--border-soft)] bg-white p-1.5">
            {lifecycleTabs.map((tab) => (
              <Link
                key={tab.value}
                href={`${basePath}/bookings?status=${tab.value}&range=${range}`}
                className={cn(
                  "inline-flex min-h-[40px] items-center justify-center whitespace-nowrap rounded-[12px] px-4 text-sm font-semibold transition",
                  tab.value === activeView
                    ? "border border-[rgba(24,168,59,0.4)] bg-[color:var(--green-soft)] text-[#117a2e]"
                    : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
                )}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        ) : null}

        <label className="flex min-h-[48px] min-w-[200px] flex-1 items-center gap-2.5 rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
          <Search className="h-4 w-4 text-[color:var(--text-soft)]" />
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
          className="inline-flex min-h-[48px] items-center justify-center rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 text-sm font-semibold text-[color:var(--navy)] transition disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      {viewMode === "calendar" ? (
        <BookingsCalendar
          entries={calendarSessions}
          updateStatusAction={updateStatusAction}
          resolveWithdrawalAction={resolveWithdrawalAction}
          returnTo={`${returnTo}#bookings-panel`}
        />
      ) : (
        <>
          {/* ------------------------------------------------ booking cards */}
          {pageBookings.length === 0 ? (
            <div className="surface-panel rounded-[24px] px-6 py-10 text-sm text-[color:var(--text-soft)]">
              No bookings match this view or those filters yet.
            </div>
          ) : null}

          {pageBookings.map((booking, index) => {
            const open = isExpanded(booking.id, index);
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
                value === booking.status
            );
            const internalNotes = (booking.internalNotes ?? "")
              .split(/\r?\n/)
              .map((note) => note.trim())
              .filter(Boolean);

            return (
              <section
                key={booking.id}
                id={`booking-${booking.id}`}
                className="grid scroll-mt-24 gap-0"
              >
                <div
                  className={cn(
                    "surface-panel rounded-[18px] px-4 py-3.5 md:px-5",
                    open && "rounded-b-none"
                  )}
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[color:var(--green-soft)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#117a2e]">
                        <Globe2 className="h-3 w-3" />
                        {titleCase(booking.source)} request
                      </span>
                      <div className="mt-2.5 flex min-w-0 items-center gap-3">
                        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8f1fd] text-[#2563eb] sm:flex">
                          <School2 className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-xl font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-2xl">
                            {booking.schoolName}
                          </h3>
                          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--text-soft)]">
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <UserRound className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{booking.primaryContactName}</span>
                            </span>
                            <span className="hidden h-4 w-px bg-[color:var(--border-soft)] sm:inline-block" />
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <Mail className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{booking.primaryContactEmail}</span>
                            </span>
                            <span className="hidden h-4 w-px bg-[color:var(--border-soft)] sm:inline-block" />
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              {titleCase(booking.regionSlug)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap lg:justify-end">
                      <div className="grid justify-items-start gap-1.5 lg:justify-items-end">
                        <StatusPill value={booking.status} />
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-[color:var(--text-soft)]">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Requested {formatShortDate(booking.createdAt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpanded((current) => ({ ...current, [booking.id]: !open }))}
                        aria-label={open ? "Collapse booking" : "Expand booking"}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)]"
                      >
                        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {open ? (
                  <>
                    <form
                      action={updateStatusAction}
                      className="surface-panel grid items-center gap-3 rounded-none border-t-0 px-4 py-3 md:px-5 lg:grid-cols-[minmax(180px,0.9fr)_minmax(190px,1fr)_minmax(240px,1.6fr)_auto]"
                    >
                      <input type="hidden" name="bookingRequestId" value={booking.id} />
                      <input type="hidden" name="returnTo" value={cardReturnTo} />
                      <div className="flex items-center gap-3 border-b border-[color:var(--border-soft)] pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8f1fd] text-[#2563eb]">
                          <ClipboardList className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-[color:var(--navy)]">Booking status</p>
                          <p className="text-[11px] leading-4 text-[color:var(--text-soft)]">
                            Update the overall status for this booking request.
                          </p>
                        </div>
                      </div>
                      <label className="grid gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                          Booking status
                        </span>
                        <select
                          name="status"
                          defaultValue={booking.status}
                          className="min-h-[34px] rounded-[10px] border border-[color:var(--border-soft)] bg-white px-3 text-xs font-semibold text-[color:var(--navy)] outline-none"
                        >
                          {statusOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                          Internal note (optional)
                        </span>
                        <input
                          name="reason"
                          placeholder="Add an internal note..."
                          className="min-h-[34px] rounded-[10px] border border-[color:var(--border-soft)] bg-white px-3 text-xs text-[color:var(--navy)] outline-none"
                        />
                      </label>
                      <button
                        type="submit"
                        className="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-[10px] border border-[#2563eb] bg-[#2563eb] px-4 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(37,99,235,0.2)] transition hover:bg-[#1d4fd7]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Update status
                      </button>
                      {internalNotes.length ? (
                        <div className="rounded-[10px] border border-[color:var(--border-soft)] bg-[#f8fbff] px-3 py-2 text-[11px] leading-4 text-[color:var(--text-soft)] lg:col-start-3 lg:col-end-5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--navy)]">
                            Saved internal notes
                          </p>
                          <div className="mt-1.5 grid gap-1.5">
                            {internalNotes.map((note, index) => (
                              <div
                                key={`${booking.id}-internal-note-${index}`}
                                className="flex items-start gap-2 rounded-[8px] bg-white px-2.5 py-1.5 text-[color:var(--navy)]"
                              >
                                <p className="min-w-0 flex-1">{note}</p>
                                <button
                                  type="submit"
                                  formAction={removeInternalNoteAction}
                                  name="noteIndex"
                                  value={String(index)}
                                  aria-label="Remove internal note"
                                  title="Remove note"
                                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#b3372e] transition hover:bg-[#fdecec]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </form>

                    <div className="surface-panel rounded-t-none rounded-b-[18px] border-t-0 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                        <CalendarDays className="h-4 w-4 text-[color:var(--text-soft)]" />
                        Requested sessions
                      </p>
                    <div className="mt-3 overflow-x-auto rounded-[14px] border border-[color:var(--border-soft)] bg-white">
                      <table className="min-w-[980px] border-separate border-spacing-0">
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
                                className="border-b border-[color:rgba(4,15,75,0.08)] bg-[#f6f9fd] px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
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
                                <span className="flex items-center gap-2.5 text-xs font-semibold text-[color:var(--navy)]">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#e8f1fd] text-[#2563eb]">
                                    <CalendarDays className="h-4 w-4" />
                                  </span>
                                  <span>
                                    {formatShortDate(session.startsAt)}
                                    <span className="block text-xs font-medium text-[color:var(--text-soft)]">
                                      {formatTime(session.startsAt)}
                                    </span>
                                  </span>
                                </span>
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5">
                                <span className="flex items-center gap-2.5 text-xs font-semibold text-[color:var(--green)]">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--green-soft)] text-[#117a2e]">
                                    <Leaf className="h-4 w-4" />
                                  </span>
                                  {session.presentationTitle}
                                </span>
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5 text-xs leading-5 text-[color:var(--text-soft)]">
                                {session.yearLevels}
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5">
                                <form
                                  action={assignAmbassadorAction}
                                  className="flex min-w-[260px] items-start gap-2"
                                >
                                  <input type="hidden" name="bookingSessionId" value={session.id} />
                                  <input type="hidden" name="returnTo" value={cardReturnTo} />
                                  <AmbassadorSearchSelect
                                    ambassadors={ambassadors}
                                    applicants={session.applicants ?? []}
                                    assignedName={session.assignedAmbassadorName}
                                  />
                                  <button
                                    type="submit"
                                    className="inline-flex min-h-[34px] items-center justify-center rounded-[9px] border border-[#75a2ff] bg-white px-3 text-xs font-semibold text-[#2563eb] shadow-[0_6px_14px_rgba(37,99,235,0.08)] transition hover:bg-[#f4f8ff]"
                                  >
                                    Assign
                                  </button>
                                </form>
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5 text-xs font-semibold text-[color:var(--navy)]">
                                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-[9px] bg-[#e8f1fd] px-2.5 text-[#2563eb]">
                                  {session.actualStudentCount ?? session.expectedStudentCount}
                                </span>
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5">
                                <StatusPill value={session.status} />
                              </td>
                              <td className="border-b border-l border-[color:rgba(4,15,75,0.06)] px-4 py-3.5">
                                <SessionDetailsButton
                                  session={session}
                                  className="min-h-[34px] rounded-[9px] border-[#dbe6f5] px-3.5 py-1 text-xs text-[#2563eb]"
                                  label={
                                    <>
                                      <Eye className="h-3.5 w-3.5" />
                                      Details
                                    </>
                                  }
                                  updateStatusAction={updateStatusAction}
                                  resolveWithdrawalAction={resolveWithdrawalAction}
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

          {/* ------------------------------------------------ pagination */}
          {filtered.length > 0 ? (
            <div className="surface-panel flex flex-wrap items-center justify-between gap-3 rounded-[20px] px-5 py-3.5">
              <p className="text-sm text-[color:var(--text-soft)]">
                Showing {(safePage - 1) * PAGE_SIZE + 1} to{" "}
                {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} booking request
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
          ) : null}
        </>
      )}
    </div>
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
  returnTo
}: {
  entries: Array<{ session: BookingSessionView; schoolName: string }>;
  updateStatusAction: (formData: FormData) => void | Promise<void>;
  resolveWithdrawalAction: (formData: FormData) => void | Promise<void>;
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
    { tone: "amber", label: "Tentative / needs ambassador" },
    { tone: "red", label: "Cancelled" }
  ];

  return (
    <div className="surface-panel rounded-[26px] p-5 md:p-6">
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
  assignedName
}: {
  ambassadors: Array<{ id: string; name: string }>;
  applicants: Array<{ id: string; name: string }>;
  assignedName?: string;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState(assignedName ?? "");
  const [selectedId, setSelectedId] = useState("");
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
      <div className="flex items-center gap-1.5 rounded-[9px] border border-[color:var(--border-soft)] bg-white px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-soft)]" />
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
          className="min-h-[32px] min-w-0 flex-1 bg-transparent text-xs text-[color:var(--navy)] outline-none placeholder:text-[color:var(--text-soft)]"
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText("");
              setSelectedId("");
            }}
            aria-label="Clear ambassador"
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
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[48px] max-w-[190px] rounded-[16px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm font-semibold text-[color:var(--navy)] outline-none"
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
