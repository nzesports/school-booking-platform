"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Copy,
  MessageSquare,
  GraduationCap,
  Eye,
  MapPin,
  Mail,
  School2,
  UserRound,
  UsersRound,
  Video
} from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingEmailsPanel } from "@/components/dashboard/booking-emails-panel";
import {
  AutoSaveBookingStatus,
  BOOKING_STATUS_OPTIONS,
  COMPLETION_STATUSES,
  schoolBookingStatus
} from "@/components/dashboard/booking-status-control";
import { StatusEmailForm } from "@/components/dashboard/status-email-form";
import { SecondaryTabs } from "@/components/ui/secondary-tabs";

import { getSignedFeedbackLinkAction, revokeBookingGuestAccessAction } from "@/app/portal/actions";
import { SessionChangeSummary } from "@/components/dashboard/session-change-summary";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type {
  SessionActionState,
  SessionDialogAction
} from "@/components/dashboard/session-update-notices";
import type { BookingSessionView, SessionApplicant } from "@/lib/domain/types";
import { maximumBookingDate, minimumBookingDate } from "@/lib/services/availability";
import {
  bookingCalendarDescription,
  buildIcsContent,
  googleCalendarUrl,
  office365Url,
  outlookLiveUrl,
  yahooCalendarUrl,
  type CalendarEventInput
} from "@/lib/services/calendar-links";
import { siteUrl } from "@/lib/site-url";
import { cn, formatDateOnly, formatWeekdayDate } from "@/lib/utils";

const NZ_TIME_ZONE = "Pacific/Auckland";

function formatNzTime(iso: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: NZ_TIME_ZONE
  }).format(new Date(iso));
}

function formatNzInputTime(iso: string) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: NZ_TIME_ZONE
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "08";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function SessionDetailsButton({
  session,
  className,
  label,
  unstyled = false,
  updateStatusAction,
  resolveWithdrawalAction,
  resolveRescheduleAction,
  updateStudentCountsAction,
  updateMeetingLinkAction,
  createTeamsLinkAction,
  updateStatusInPlaceAction,
  open: controlledOpen,
  onOpen,
  onClose,
  hideTrigger = false,
  returnTo
}: {
  session: BookingSessionView;
  className?: string;
  label?: ReactNode;
  unstyled?: boolean;
  updateStatusAction?: (formData: FormData) => void | Promise<void>;
  resolveWithdrawalAction?: (formData: FormData) => void | Promise<void>;
  resolveRescheduleAction?: (formData: FormData) => void | Promise<void>;
  // Staff/admin only: lets the student numbers on this session be corrected.
  updateStudentCountsAction?: SessionDialogAction;
  // Staff/admin only: sets the video-call link on an online session.
  updateMeetingLinkAction?: SessionDialogAction;
  // Staff/admin only: creates a Microsoft Teams meeting for an online session.
  createTeamsLinkAction?: SessionDialogAction;
  // Staff/admin only: change the booking's status without leaving the dialog.
  updateStatusInPlaceAction?: SessionDialogAction;
  // Optional control from a parent (the bookings list keeps one dialog open
  // even if the booking moves page after a change). onOpen replaces the
  // built-in dialog; hideTrigger renders the dialog only.
  open?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  hideTrigger?: boolean;
  returnTo?: string;
}) {
  const [tab, setTab] = useState<"details" | "emails">("details");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const openDialog = () => (onOpen ? onOpen() : setInternalOpen(true));
  const closeDialog = () => {
    setInternalOpen(false);
    onClose?.();
  };
  const [feedbackLinkCopied, setFeedbackLinkCopied] = useState(false);
  const canReview = Boolean(updateStatusAction && session.bookingRequestId);

  const copyFeedbackLink = async () => {
    // Signed on the server: an unsigned /feedback/<id> link no longer opens
    // the form, so the school can't be impersonated by anyone who knows the id.
    const feedbackUrl = await getSignedFeedbackLinkAction(session.id);

    if (!feedbackUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(feedbackUrl);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = feedbackUrl;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }

    setFeedbackLinkCopied(true);
  };

  const isOnline = session.deliveryMode === "online";
  const location = isOnline
    ? session.meetingUrl || "Online (video call)"
    : session.locationAddress || session.schoolAddress || session.schoolName;
  const calendarEvent: CalendarEventInput = {
    uid: `${session.id}@book.nzesports.org.nz`,
    cancelled: ["cancelled", "declined"].includes(session.status),
    title: `${session.presentationTitle} — ${session.schoolName}`,
    description: bookingCalendarDescription({
      presentationTitle: session.presentationTitle,
      schoolName: session.schoolName,
      ambassadorName: session.assignedAmbassadorName,
      yearLevels: session.yearLevels,
      expectedStudentCount: session.expectedStudentCount,
      manageUrl: `${siteUrl}/manage-booking`
    }) + (session.contactName ? `\nSchool contact: ${session.contactName}` : ""),
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
      {hideTrigger ? null : unstyled ? (
        <button type="button" onClick={openDialog} className={className}>
          {label ?? "Details"}
        </button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={openDialog}
          className={
            className ??
            "min-h-[40px] rounded-[13px] border-transparent bg-[#e8f1fd] px-3.5 py-1.5 text-xs text-[#1e4fae] shadow-none hover:bg-[#dceafe]"
          }
        >
          {label ?? (
            <>
              <Eye className="h-3.5 w-3.5" />
              View booking
            </>
          )}
        </Button>
      )}

      {/* Portalled to <body> so glassy card ancestors (backdrop-filter) can't
          trap the fixed overlay inside their own bounds. */}
      {open
        ? createPortal(
            <BookingDialogShell
              title={session.presentationTitle}
              onClose={closeDialog}
              maxWidthClassName="max-w-[1120px]"
              bodyClassName="px-6 py-7 md:px-10 md:py-9 lg:px-12 lg:py-10"
              overlayClassName="z-[80]"
              compact
            >
              {canReview && <SecondaryTabs ariaLabel="Booking details" value={tab} onChange={setTab} items={[
                { value: "details", label: "Details", icon: CalendarDays },
                { value: "emails", label: "Emails", icon: Mail }
              ]} />}
              {canReview && tab === "emails" ? <BookingEmailsPanel sessionId={session.id} /> : <>
              <SessionChangeSummary session={session} />
              <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
                <p className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-[-0.02em] text-[#117a2e] md:text-lg">
                  <CalendarDays className="h-5 w-5 shrink-0 text-[#117a2e]" />
                  {formatWeekdayDate(session.startsAt)}
                  <span aria-hidden="true">·</span>
                  {formatNzTime(session.startsAt)} – {formatNzTime(session.endsAt)}
                </p>
                {updateStatusInPlaceAction && session.bookingRequestId ? (
                  <DialogStatusControl session={session} action={updateStatusInPlaceAction} />
                ) : null}
              </div>

              <section aria-label="Session overview" className="mt-4 rounded-2xl bg-slate-50/80 p-5 md:p-6">
              <div className="grid gap-5 md:grid-cols-3">
                <DetailTile
                  icon={<School2 className="h-6 w-6" />}
                  label="School"
                >
                  <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    {session.schoolName}
                  </p>
                </DetailTile>

                <DetailTile
                  icon={<UsersRound className="h-6 w-6" />}
                  label="Audience"
                >
                  <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    {session.yearLevels}
                  </p>
                </DetailTile>

                <DetailTile
                  icon={<GraduationCap className="h-6 w-6" />}
                  label="Students"
                >
                  <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    {session.actualStudentCount ?? session.expectedStudentCount} students
                  </p>
                  <p className="text-sm text-[color:var(--text-soft)]">
                    {session.actualStudentCount !== undefined
                      ? `Final attendance · ${session.expectedStudentCount} expected`
                      : "School booking estimate"}
                  </p>
                </DetailTile>
              </div>

              {updateStudentCountsAction ? (
                <StudentNumbersForm session={session} action={updateStudentCountsAction} />
              ) : null}

              {isOnline && updateMeetingLinkAction ? (
                <MeetingLinkSection
                  session={session}
                  updateMeetingLinkAction={updateMeetingLinkAction}
                  createTeamsLinkAction={createTeamsLinkAction}
                />
              ) : null}

              <div className="mt-5 grid gap-5 border-t border-slate-200/70 pt-5 md:grid-cols-2">
                <DetailTile
                  icon={<MapPin className="h-6 w-6" />}
                  label="Location"
                >
                  {isOnline ? (
                    <>
                      <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                        Online (video call)
                      </p>
                      {session.meetingUrl ? (
                        <a
                          href={session.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-sm leading-6 font-semibold text-[#246bff] underline"
                        >
                          {session.meetingUrl}
                        </a>
                      ) : (
                        <p className="text-sm text-[color:var(--text-soft)]">
                          Video-call link to be added by our team.
                        </p>
                      )}
                    </>
                  ) : session.regionName ? (
                    <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                      {session.regionName}
                    </p>
                  ) : null}
                  {isOnline ? null : session.schoolAddress || session.locationAddress ? (
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
                  label="School contact"
                >
                  {session.contactName ? (
                    <>
                      <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                        {session.contactName}
                      </p>
                      {session.contactPosition && <p className="text-sm text-slate-500">{session.contactPosition}</p>}
                      <p className="text-sm leading-6 text-[color:var(--text-soft)]">
                        {session.contactEmail ? (
                          <a
                            href={`mailto:${session.contactEmail}`}
                            className="text-[color:var(--navy)] underline decoration-slate-300 underline-offset-4 hover:decoration-slate-500"
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
                      Contact details are shared once you are assigned to the session.
                    </p>
                  )}
                </DetailTile>
              </div>

              </section>

              <section aria-labelledby="session-ambassadors-heading" className="mt-6">
                <h3 id="session-ambassadors-heading" className="text-base font-semibold text-[color:var(--navy)]">Ambassadors</h3>
              <div className="mt-3 grid gap-5 md:grid-cols-2">
              {session.assignedAmbassadorName ? (
                <div className="min-w-0">
                  <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">
                      <UserRound className="h-5 w-5" />
                    </span>
                    Assigned ambassador
                  </p>
                  <div className="mt-2 pl-8">
                    <p className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                      {session.assignedAmbassadorName}
                    </p>
                    {canReview && (session.assignedAmbassadorEmail || session.assignedAmbassadorPhone) ? (
                      <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">
                        {session.assignedAmbassadorEmail ? (
                          <a
                            href={`mailto:${session.assignedAmbassadorEmail}`}
                            className="text-[color:var(--navy)] underline decoration-slate-300 underline-offset-4 hover:decoration-slate-500"
                          >
                            {session.assignedAmbassadorEmail}
                          </a>
                        ) : null}
                        {session.assignedAmbassadorEmail && session.assignedAmbassadorPhone
                          ? " / "
                          : ""}
                        {session.assignedAmbassadorPhone ?? ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : canReview ? (
                <div className="min-w-0">
                  <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">
                      <UserRound className="h-5 w-5" />
                    </span>
                    No ambassador assigned yet
                    <InfoTooltip label="No ambassador assigned yet">
                      Assign an active applicant or search approved ambassadors from the booking row.
                    </InfoTooltip>
                  </p>
                </div>
              ) : null}

              {canReview ? (
                <div className="min-w-0">
                  <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">
                      <UsersRound className="h-5 w-5" />
                    </span>
                    Ambassador applications
                  </p>
                  {session.applicants?.length ? (
                    <div className="mt-4 grid gap-2">
                      {session.applicants.map((applicant) => (
                        <div
                          key={applicant.id}
                          className="rounded-[12px] border border-slate-200 bg-white px-3 py-2.5"
                        >
                          <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#117a2e]" />
                            {applicant.name}
                          </p>
                          <p className="mt-0.5 pl-6 text-xs text-[color:var(--text-soft)]">
                            {applicantTrackRecord(applicant)}
                          </p>
                          {applicant.message ? (
                            <p className="mt-1.5 whitespace-pre-wrap pl-6 text-sm leading-6 text-[color:var(--text-dark)]">
                              {applicant.message}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 pl-8 text-sm leading-6 text-[color:var(--text-soft)]">
                      No active applications.
                    </p>
                  )}
                </div>
              ) : null}

              </div>

              </section>

              {session.status === "reschedule_requested" && resolveRescheduleAction ? (
                <div className="mt-4 rounded-[22px] border border-[#f2ddb0] bg-[#fff8e8] p-5">
                  <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-[#9a5a00]">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white shadow-[0_8px_20px_rgba(154,90,0,0.12)]">
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    School reschedule request
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#8f680f]">
                    Preferred date: {session.rescheduleRequestedDate ? formatDateOnly(session.rescheduleRequestedDate) : "Not provided"}
                    {session.rescheduleRequestNotes
                      ? ` — ${session.rescheduleRequestNotes}`
                      : ""}
                  </p>
                  <form
                    action={resolveRescheduleAction}
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    <input type="hidden" name="bookingSessionId" value={session.id} />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={returnTo ?? "/staff/bookings"}
                    />
                    <input type="hidden" name="decision" value="approve" />
                    <label className="grid gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a5a00]">
                        Final date
                      </span>
                      <input
                        name="finalDate"
                        type="date"
                        min={minimumBookingDate()}
                        max={maximumBookingDate()}
                        defaultValue={session.rescheduleRequestedDate}
                        required
                        className="min-h-[44px] rounded-[12px] border border-[#f2ddb0] bg-white px-3 text-sm text-[color:var(--navy)] outline-none"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a5a00]">
                        Final time
                      </span>
                      <input
                        name="finalTime"
                        type="time"
                        defaultValue={formatNzInputTime(session.startsAt)}
                        required
                        className="min-h-[44px] rounded-[12px] border border-[#f2ddb0] bg-white px-3 text-sm text-[color:var(--navy)] outline-none"
                      />
                    </label>
                    <PendingSubmitButton
                      type="submit"
                      pendingLabel="Approving reschedule..."
                      className="sm:col-span-2"
                    >
                      Approve with final date and time
                    </PendingSubmitButton>
                  </form>
                  <form action={resolveRescheduleAction} className="mt-3">
                    <input type="hidden" name="bookingSessionId" value={session.id} />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={returnTo ?? "/staff/bookings"}
                    />
                    <input type="hidden" name="decision" value="decline" />
                    <PendingSubmitButton
                      type="submit"
                      variant="secondary"
                      pendingLabel="Declining reschedule..."
                    >
                      Decline and keep original time
                    </PendingSubmitButton>
                  </form>
                </div>
              ) : null}

              {session.status === "withdrawal_requested" && resolveWithdrawalAction ? (
                <div className="mt-4 rounded-[22px] border border-[#f2ddb0] bg-[#fff8e8] p-5">
                  <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-[#9a5a00]">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#9a5a00] shadow-[0_8px_20px_rgba(154,90,0,0.12)]">
                      <AlertTriangle className="h-5 w-5" />
                    </span>
                    {session.assignedAmbassadorName ?? "Ambassador"} asked to withdraw
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#8f680f]">
                    {session.withdrawalReason ? `"${session.withdrawalReason}"` : "No reason provided."}
                  </p>
                  <div className="mt-4 grid gap-3">
                    <form action={resolveWithdrawalAction}>
                      <input type="hidden" name="bookingSessionId" value={session.id} />
                      <input type="hidden" name="returnTo" value={returnTo ?? "/staff/bookings"} />
                      <input type="hidden" name="decision" value="approve" />
                      <PendingSubmitButton unstyled
                        type="submit"
                        className="inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] border border-[#18a83b] bg-[#18a83b] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(24,168,59,0.22)] transition hover:bg-[#12852f] sm:w-auto"
                      >
                        Approve withdrawal - reopen session
                      </PendingSubmitButton>
                    </form>
                    <form
                      action={resolveWithdrawalAction}
                      className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <input type="hidden" name="bookingSessionId" value={session.id} />
                      <input type="hidden" name="returnTo" value={returnTo ?? "/staff/bookings"} />
                      <input type="hidden" name="decision" value="decline" />
                      <label className="grid gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a5a00]">
                          Reply note (optional)
                        </span>
                        <input
                          name="note"
                          placeholder="Reply to the ambassador..."
                          className="min-h-[44px] rounded-[12px] border border-[#f2ddb0] bg-white px-3 text-sm text-[color:var(--navy)] outline-none"
                        />
                      </label>
                      <PendingSubmitButton unstyled
                        type="submit"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[#f2ddb0] bg-white px-4 text-sm font-semibold text-[#9a5a00] transition hover:bg-[#fff2d8]"
                      >
                        Decline - keep assigned
                      </PendingSubmitButton>
                    </form>
                  </div>
                </div>
              ) : null}

              {canReview ? (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-5">
                  <div>
                    <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                      <MessageSquare className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                      Share school feedback form
                      <InfoTooltip label="Share school feedback form">
                        Only send this link to the school. Anyone with it can submit feedback on behalf of the school after the session, with no login.
                      </InfoTooltip>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={copyFeedbackLink}
                    className="h-9 min-h-[36px] rounded-lg px-3 text-xs! font-semibold! leading-4! shadow-none"
                  >
                    {feedbackLinkCopied ? (
                      <CheckCircle2 className="h-4 w-4 text-[#117a2e]" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {feedbackLinkCopied ? "Link copied" : "Copy feedback link"}
                  </Button>
                </div>
              ) : null}

              <div className="mt-5 border-t border-slate-200/70 pt-5">
                <p className="flex items-center gap-3 text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                  <span className="flex h-5 w-5 items-center justify-center text-slate-500">
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
                      className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-[color:var(--border-soft)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)] transition hover:bg-slate-50"
                    >
                      {provider.icon}
                      {provider.label}
                    </a>
                  ))}
                </div>
              </div>
              {canReview ? <details className="mt-5 border-t border-slate-200/70 pt-4">
                <summary className="cursor-pointer text-sm font-medium">Guest access security</summary>
                <p className="mt-2 text-sm text-slate-600">End all active guest sessions for this booking. The contact will need to enter their booking reference and email again.</p>
                <form action={revokeBookingGuestAccessAction} className="mt-3">
                  <input type="hidden" name="bookingRequestId" value={session.bookingRequestId} />
                  <input type="hidden" name="returnTo" value={returnTo ?? "/staff/bookings"} />
                  <PendingSubmitButton type="submit" variant="secondary" pendingLabel="Ending access...">End guest access</PendingSubmitButton>
                </form>
              </details> : null}
              </>}
            </BookingDialogShell>,
            document.body
          )
        : null}
    </>
  );
}

function meetingProviderLabel(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "Microsoft Teams";
    if (host.endsWith("zoom.us")) return "Zoom";
    if (host === "meet.google.com") return "Google Meet";
    if (host.endsWith("webex.com")) return "Webex";
  } catch {
    return "Video call";
  }
  return "Video call";
}

const noSessionAction: SessionDialogAction = async () => null;

const meetingInputClassName =
  "min-h-[44px] w-full rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3 text-sm text-[color:var(--navy)] outline-none focus:border-[rgba(24,168,59,0.4)]";

// Booking status inside the details dialog. Uses the same dropdown and
// "email the school?" prompt as the bookings list, but saves in place.
function DialogStatusControl({
  session,
  action
}: {
  session: BookingSessionView;
  action: SessionDialogAction;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [requestedStatus, setRequestedStatus] = useState<string | null>(null);
  // While saving, keep showing the status just chosen (the form resets as
  // soon as the action is dispatched); afterwards show the saved status.
  const currentStatus =
    isPending && requestedStatus ? requestedStatus : session.bookingStatus ?? session.status;
  const sessionIsFuture = new Date(session.endsAt).getTime() > new Date().getTime();
  const options = BOOKING_STATUS_OPTIONS.filter(
    ([value]) =>
      !sessionIsFuture ||
      !COMPLETION_STATUSES.has(value) ||
      value === schoolBookingStatus(currentStatus)
  );

  return (
    <div className="grid w-full gap-2 sm:w-[260px]">
      <StatusEmailForm
        action={(data) => {
          setRequestedStatus(String(data.get("status") || ""));
          formAction(data);
        }}
      >
        <input type="hidden" name="bookingRequestId" value={session.bookingRequestId} />
        <AutoSaveBookingStatus
          key={currentStatus}
          currentStatus={currentStatus}
          options={options}
          saving={isPending}
        />
      </StatusEmailForm>
      <ActionMessage state={state} />
    </div>
  );
}

// Staff-only expected/actual student numbers. Saves in place (no redirect)
// so the details dialog stays open.
function StudentNumbersForm({
  session,
  action
}: {
  session: BookingSessionView;
  action: SessionDialogAction;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form
      action={formAction}
      className="mt-5 grid gap-3 border-t border-slate-200/70 pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
    >
      <input type="hidden" name="sessionId" value={session.id} />
      <label className="grid gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
          Expected students
        </span>
        <input
          name="expectedStudentCount"
          type="number"
          min={0}
          max={10000}
          step={1}
          defaultValue={session.expectedStudentCount > 0 ? session.expectedStudentCount : ""}
          placeholder="e.g. 120"
          className={meetingInputClassName}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
          Actual students
        </span>
        <input
          name="actualStudentCount"
          type="number"
          min={0}
          max={10000}
          step={1}
          defaultValue={session.actualStudentCount ?? ""}
          placeholder="Optional"
          className={meetingInputClassName}
        />
      </label>
      <PendingSubmitButton type="submit" pendingLabel="Saving...">
        Save student numbers
      </PendingSubmitButton>
      {session.reportStatus === "submitted" || session.reportStatus === "reviewed" ? (
        <p className="text-xs text-[color:var(--text-soft)] sm:col-span-3">
          This session has an ambassador report, so the report&apos;s attendance is shown as the
          actual figure.
        </p>
      ) : null}
      <ActionMessage state={state} className="sm:col-span-3" />
    </form>
  );
}

function ActionMessage({ state, className }: { state: SessionActionState; className?: string }) {
  if (!state) {
    return null;
  }

  return (
    <p
      role={state.tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-[12px] px-3 py-2 text-xs font-medium",
        state.tone === "error" ? "bg-[#fff6f6] text-[#9d2424]" : "bg-[#eef8f1] text-[#1d6f35]",
        className
      )}
    >
      {state.tone === "error" ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      {state.message}
    </p>
  );
}

// Staff-only video-call link controls for an online session: create a Teams
// meeting, or paste a link from Zoom, Google Meet, Teams or anything else.
function MeetingLinkSection({
  session,
  updateMeetingLinkAction,
  createTeamsLinkAction
}: {
  session: BookingSessionView;
  updateMeetingLinkAction: SessionDialogAction;
  createTeamsLinkAction?: SessionDialogAction;
}) {
  const [copied, setCopied] = useState(false);
  // Both actions save in place and report back here, so the dialog stays open
  // and the new link appears as soon as the page data refreshes.
  const [lastSource, setLastSource] = useState<"link" | "teams">("link");
  const [linkState, linkFormAction] = useActionState(updateMeetingLinkAction, null);
  const [teamsState, teamsFormAction] = useActionState(
    createTeamsLinkAction ?? noSessionAction,
    null
  );
  const actionState = lastSource === "teams" ? teamsState : linkState;
  const meetingUrl = session.meetingUrl;
  const confirmedWithoutLink =
    !meetingUrl && ["confirmed", "ambassador_assigned"].includes(session.status);

  return (
    <div className="mt-5 grid gap-3 border-t border-slate-200/70 pt-5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
          Video-call link
        </span>
        <InfoTooltip label="Video-call link">
          Create a Teams link with one click, or paste a link from Zoom, Google Meet or any other
          tool. Schools and ambassadors can join Teams links from a web browser without an account.
          If the session is already confirmed, saving a link emails it to the school and ambassador.
        </InfoTooltip>
      </div>

      {meetingUrl ? (
        <div className="flex min-w-0 items-center gap-2 rounded-[12px] border border-[color:var(--border-soft)] bg-[#f6f9fd] py-1.5 pl-3 pr-1.5">
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[color:var(--navy)] shadow-[inset_0_0_0_1px_rgba(4,15,75,0.08)]">
            {meetingProviderLabel(meetingUrl)}
          </span>
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={meetingUrl}
            className="min-w-0 flex-1 truncate text-sm text-[#246bff] underline"
          >
            {meetingUrl}
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(meetingUrl);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[9px] px-2.5 text-xs font-semibold text-[color:var(--navy)] transition hover:bg-white"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <form action={linkFormAction} onSubmit={() => setLastSource("link")}>
            <input type="hidden" name="sessionId" value={session.id} />
            <input type="hidden" name="meetingUrl" value="" />
            <PendingSubmitButton
              unstyled
              type="submit"
              pendingLabel="Removing..."
              className="inline-flex h-8 shrink-0 items-center rounded-[9px] px-2.5 text-xs! font-semibold! text-[#9d2424] transition hover:bg-white"
            >
              Remove
            </PendingSubmitButton>
          </form>
        </div>
      ) : createTeamsLinkAction ? (
        <form action={teamsFormAction} onSubmit={() => setLastSource("teams")}>
          <input type="hidden" name="sessionId" value={session.id} />
          <PendingSubmitButton type="submit" pendingLabel="Creating Teams link..." className="w-full sm:w-auto">
            <Video className="h-4 w-4" />
            Create Teams link
          </PendingSubmitButton>
        </form>
      ) : null}

      <form
        action={linkFormAction}
        onSubmit={() => setLastSource("link")}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input type="hidden" name="sessionId" value={session.id} />
        <input
          name="meetingUrl"
          type="url"
          inputMode="url"
          maxLength={2000}
          pattern="https://.*"
          required
          aria-label={meetingUrl ? "Replace with another link" : "Paste a video-call link"}
          placeholder={
            meetingUrl ? "Replace with another link (https://...)" : "Or paste a Zoom, Google Meet or Teams link"
          }
          className={meetingInputClassName}
        />
        <PendingSubmitButton type="submit" variant="secondary" pendingLabel="Saving..." className="shrink-0">
          Save link
        </PendingSubmitButton>
      </form>

      <ActionMessage state={actionState} />

      {confirmedWithoutLink ? (
        <p className="flex items-start gap-2 rounded-[12px] bg-[#fff8ea] px-3 py-2 text-xs font-medium text-[#7a4a00]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This session is confirmed but has no video-call link yet. Adding one emails it to the school
          and ambassador.
        </p>
      ) : null}
    </div>
  );
}

function DetailTile({
  icon,
  label,
  children,
  className
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3",
        className
      )}
    >
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 [&>svg]:h-5 [&>svg]:w-5"
      >
        {icon}
      </span>
      <div className="min-w-0 break-words">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
          {label}
        </span>
        <div className="mt-1">{children}</div>
      </div>
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

function applicantTrackRecord(applicant: SessionApplicant) {
  const delivered = applicant.deliveredSessions ?? 0;

  if (delivered === 0) {
    return "New ambassador · no sessions delivered yet";
  }

  const sessions = `${delivered} ${delivered === 1 ? "session" : "sessions"} delivered`;

  return applicant.averageRating === undefined
    ? sessions
    : `${sessions} · ★ ${applicant.averageRating.toFixed(1)} (${applicant.reviewCount} ${applicant.reviewCount === 1 ? "review" : "reviews"})`;
}
