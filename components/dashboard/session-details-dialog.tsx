"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  Info,
  MapPin,
  School2,
  UserRound,
  UsersRound
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import type { BookingSessionView } from "@/lib/domain/types";
import {
  buildIcsContent,
  googleCalendarUrl,
  office365Url,
  outlookLiveUrl,
  yahooCalendarUrl,
  type CalendarEventInput
} from "@/lib/services/calendar-links";
import { cn } from "@/lib/utils";

const NZ_TIME_ZONE = "Pacific/Auckland";

function formatNzDate(iso: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: NZ_TIME_ZONE
  }).format(new Date(iso));
}

function formatNzTime(iso: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: NZ_TIME_ZONE
  }).format(new Date(iso));
}

const BOOKING_REVIEW_STATUS_OPTIONS = [
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

export function SessionDetailsButton({
  session,
  className,
  label,
  unstyled = false,
  updateStatusAction,
  returnTo
}: {
  session: BookingSessionView;
  className?: string;
  label?: ReactNode;
  unstyled?: boolean;
  updateStatusAction?: (formData: FormData) => void | Promise<void>;
  returnTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const canReview = Boolean(updateStatusAction && session.bookingRequestId);

  const location = session.locationAddress || session.schoolAddress || session.schoolName;
  const calendarEvent: CalendarEventInput = {
    title: `${session.presentationTitle} — ${session.schoolName}`,
    description: [
      `NZ Esports school presentation: ${session.presentationTitle}.`,
      `Year levels: ${session.yearLevels}.`,
      `Expected students: ${session.expectedStudentCount}.`,
      session.contactName ? `School contact: ${session.contactName}.` : ""
    ]
      .filter(Boolean)
      .join(" "),
    location,
    startsAt: session.startsAt,
    endsAt: session.endsAt
  };
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcsContent(calendarEvent))}`;

  const calendarProviders: Array<{ label: string; href?: string; download?: string; icon: ReactNode }> = [
    { label: "Google", href: googleCalendarUrl(calendarEvent), icon: <GoogleLogo /> },
    { label: "Outlook.com", href: outlookLiveUrl(calendarEvent), icon: <OutlookLogo /> },
    { label: "Office 365", href: office365Url(calendarEvent), icon: <OfficeLogo /> },
    { label: "Yahoo", href: yahooCalendarUrl(calendarEvent), icon: <YahooLogo /> },
    {
      label: "Apple / ICS file",
      href: icsHref,
      download: `nz-esports-${session.presentationSlug}.ics`,
      icon: <CalendarDays className="h-4 w-4 text-[color:var(--text-soft)]" />
    }
  ];

  return (
    <>
      {unstyled ? (
        <button type="button" onClick={() => setOpen(true)} className={className}>
          {label ?? "Details"}
        </button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          className={className ?? "min-h-[38px] rounded-[14px] px-3.5 py-1.5 text-xs"}
        >
          {label ?? (
            <>
              <Info className="h-3.5 w-3.5" />
              Details
            </>
          )}
        </Button>
      )}

      {/* Portalled to <body> so glassy card ancestors (backdrop-filter) can't
          trap the fixed overlay inside their own bounds. */}
      {open
        ? createPortal(
            <BookingDialogShell
              kicker="Booking details"
              title={session.presentationTitle}
              onClose={() => setOpen(false)}
              maxWidthClassName="max-w-[700px]"
              overlayClassName="z-[80]"
              compact
            >
              <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-[14px] bg-[color:var(--green-soft)] px-3.5 py-2 text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)] md:text-lg">
                <CalendarDays className="h-5 w-5 shrink-0 text-[#117a2e]" />
                {formatNzDate(session.startsAt)}
                <span className="text-[#117a2e]">·</span>
                {formatNzTime(session.startsAt)} – {formatNzTime(session.endsAt)}
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <DetailTile
                  icon={<School2 className="h-6 w-6" />}
                  iconClassName="bg-[#e6f5ec] text-[#117a2e]"
                  label="School"
                >
                  <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    {session.schoolName}
                  </p>
                </DetailTile>

                <DetailTile
                  icon={<UsersRound className="h-6 w-6" />}
                  iconClassName="bg-[#eceafb] text-[#6a5cd0]"
                  label="Audience"
                >
                  <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    {session.yearLevels}
                  </p>
                </DetailTile>

                <DetailTile
                  icon={<Clock3 className="h-6 w-6" />}
                  iconClassName="bg-[#e6f5ec] text-[#117a2e]"
                  label="Time"
                >
                  <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    {formatNzTime(session.startsAt)} – {formatNzTime(session.endsAt)}
                  </p>
                  <p className="text-sm text-[color:var(--text-soft)]">(NZ time)</p>
                </DetailTile>

                <DetailTile
                  icon={<GraduationCap className="h-6 w-6" />}
                  iconClassName="bg-[#e3f2fd] text-[#1565c0]"
                  label="Expected students"
                >
                  <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    {session.expectedStudentCount} students
                  </p>
                  {session.actualStudentCount ? (
                    <p className="text-sm text-[color:var(--text-soft)]">
                      {session.actualStudentCount} attended
                    </p>
                  ) : null}
                </DetailTile>
              </div>

              <div className="mt-4 grid gap-4">
                <DetailTile
                  icon={<MapPin className="h-6 w-6" />}
                  iconClassName="bg-[#eceafb] text-[#6a5cd0]"
                  label="Location"
                >
                  {session.regionName ? (
                    <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                      {session.regionName}
                    </p>
                  ) : null}
                  {session.schoolAddress || session.locationAddress ? (
                    <p className="text-sm leading-6 text-[color:var(--text-soft)]">
                      {session.locationAddress ?? session.schoolAddress}
                    </p>
                  ) : (
                    <p className="text-sm text-[color:var(--text-soft)]">
                      Address to be confirmed by our team.
                    </p>
                  )}
                </DetailTile>

                <DetailTile
                  icon={<UserRound className="h-6 w-6" />}
                  iconClassName="bg-[#fdf3dc] text-[#b7822c]"
                  label="School contact"
                >
                  {session.contactName ? (
                    <>
                      <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                        {session.contactName}
                      </p>
                      <p className="text-sm leading-6 text-[color:var(--text-soft)]">
                        {session.contactEmail ? (
                          <a
                            href={`mailto:${session.contactEmail}`}
                            className="font-semibold text-[color:var(--green)]"
                          >
                            {session.contactEmail}
                          </a>
                        ) : null}
                        {session.contactEmail && session.contactPhone ? " · " : ""}
                        {session.contactPhone ?? ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm leading-6 text-[color:var(--text-soft)]">
                      Contact details are shared once our team confirms the session.
                    </p>
                  )}
                </DetailTile>
              </div>

              {canReview && updateStatusAction ? (
                <div className="mt-4 rounded-[22px] border border-[#c4dbfb] bg-[#f4f8ff] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                      <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#1e4fae] shadow-[0_8px_20px_rgba(37,99,235,0.16)]">
                        <ClipboardCheck className="h-5 w-5" />
                      </span>
                      Review booking
                    </p>
                    {session.bookingStatus ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)] shadow-[0_6px_16px_rgba(11,24,77,0.08)]">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            session.bookingStatus === "confirmed"
                              ? "bg-[#18a83b]"
                              : session.bookingStatus === "tentative"
                                ? "bg-[#e8a13c]"
                                : "bg-[#2563eb]"
                          )}
                        />
                        Currently {session.bookingStatus.replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </div>

                  {session.bookingStatus === "tentative" ? (
                    <form action={updateStatusAction} className="mt-4">
                      <input type="hidden" name="bookingRequestId" value={session.bookingRequestId} />
                      <input type="hidden" name="returnTo" value={returnTo ?? "/staff/bookings"} />
                      <input type="hidden" name="status" value="confirmed" />
                      <input type="hidden" name="reason" value="Approved from booking details" />
                      <button
                        type="submit"
                        className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#18a83b] bg-[#18a83b] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(24,168,59,0.28)] transition hover:bg-[#128232] sm:w-auto"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve booking
                      </button>
                    </form>
                  ) : null}

                  <form
                    action={updateStatusAction}
                    className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto]"
                  >
                    <input type="hidden" name="bookingRequestId" value={session.bookingRequestId} />
                    <input type="hidden" name="returnTo" value={returnTo ?? "/staff/bookings"} />
                    <label className="grid gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                        Set status
                      </span>
                      <span className="relative block">
                        <select
                          name="status"
                          defaultValue={session.bookingStatus ?? "tentative"}
                          className="min-h-[44px] w-full appearance-none rounded-[12px] border border-[color:var(--border-soft)] bg-white pl-3 pr-9 text-sm font-semibold text-[color:var(--navy)] outline-none"
                        >
                          {BOOKING_REVIEW_STATUS_OPTIONS.map(([value, optionLabel]) => (
                            <option key={value} value={value}>
                              {optionLabel}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-soft)]" />
                      </span>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                        Internal note (optional)
                      </span>
                      <input
                        name="reason"
                        placeholder="Add an internal note..."
                        className="min-h-[44px] rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3 text-sm text-[color:var(--navy)] outline-none"
                      />
                    </label>
                    <button
                      type="submit"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[#2563eb] bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)] transition hover:bg-[#1d4fd7]"
                    >
                      Update status
                    </button>
                  </form>
                  <p className="mt-2.5 text-xs text-[#1e4fae]">
                    Status changes apply to the whole booking request and are recorded in the
                    booking history.
                  </p>
                </div>
              ) : null}

              <div className="mt-4 rounded-[22px] border border-[rgba(24,168,59,0.22)] bg-[#f2faf4] p-5">
                <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#117a2e] shadow-[0_8px_20px_rgba(24,168,59,0.16)]">
                    <CalendarDays className="h-5 w-5" />
                  </span>
                  Add to your calendar
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {calendarProviders.map((provider) => (
                    <a
                      key={provider.label}
                      href={provider.href}
                      {...(provider.download
                        ? { download: provider.download }
                        : { target: "_blank", rel: "noreferrer" })}
                      className="inline-flex min-h-[46px] items-center justify-center gap-2.5 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)] shadow-[0_8px_20px_rgba(11,24,77,0.06)] transition hover:border-[rgba(4,15,75,0.2)]"
                    >
                      {provider.icon}
                      {provider.label}
                    </a>
                  ))}
                </div>
              </div>
            </BookingDialogShell>,
            document.body
          )
        : null}
    </>
  );
}

function DetailTile({
  icon,
  iconClassName,
  label,
  children,
  className
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3.5 rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 p-4",
        className
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full [&>svg]:h-5 [&>svg]:w-5",
          iconClassName
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
          {label}
        </span>
        <span className="mt-1 block">{children}</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline brand marks for the add-to-calendar buttons                  */
/* ------------------------------------------------------------------ */

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.22 7.22 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.29a11.99 11.99 0 0 0 0 10.74l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.42-3.42C17.94 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

function OutlookLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <rect x="1" y="4" width="13" height="16" rx="2" fill="#0F6CBD" />
      <ellipse cx="7.5" cy="12" rx="3.4" ry="4" fill="none" stroke="#fff" strokeWidth="2" />
      <path fill="#28A8EA" d="M14 7h9v10.5A2.5 2.5 0 0 1 20.5 20H14V7Z" />
      <path fill="#0F6CBD" d="M14 7h9l-4.5 3.5L14 7Z" opacity="0.9" />
    </svg>
  );
}

function OfficeLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#DC3E15" d="M14.5 1 4 4.9v14.2L14.5 23l5.5-1.7V2.7L14.5 1Z" />
      <path fill="#fff" d="M14.5 5.4v13.2L7.6 17V7.6l6.9-2.2Z" opacity="0.92" />
      <path fill="#DC3E15" d="M14.5 5.4 7.6 7.6V17l6.9 1.6V5.4Z" opacity="0.35" />
    </svg>
  );
}

function YahooLogo() {
  return (
    <span className="text-base font-black leading-none tracking-[-0.05em] text-[#5f01d1]" aria-hidden>
      y!
    </span>
  );
}
