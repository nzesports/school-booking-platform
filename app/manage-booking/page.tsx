import { cookies } from "next/headers";
import { CHALLENGE_COOKIE, CHANGE_NOTICE_HOURS } from "@/lib/services/booking-access-security";
import type { Metadata } from "next";
import { CalendarClock, Hash, Mail, Check, ArrowLeft, ArrowRight, ChevronDown, Clock3, GraduationCap, LogOut, MapPin, ShieldCheck, UserRound, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { ButtonLink } from "@/components/ui/button";
import { loadGuestBookings } from "@/lib/services/guest-booking-access";
import { maximumBookingDate, minimumBookingDate } from "@/lib/services/availability";
import { formatDateTime, formatTime } from "@/lib/utils";
import { changeGuestSessionAction, endBookingAccessAction, requestBookingAccessAction, verifyBookingAccessAction } from "./actions";

export const metadata: Metadata = {
  title: "Manage your booking | NZ Esports", robots: { index: false, follow: false }, referrer: "no-referrer"
};

const messages: Record<string, string> = {
  code: "That code is invalid or expired. Check the code or request a new one. Each code allows five attempts.",
  cutoff: "Changes within 24 hours of the session must be arranged with the team.",
  identifier: "Enter your six-digit booking reference and a valid booking email address.",
  "not-found": "Those details do not match a booking. Check your reference and booking email address, then try again.",
  unavailable: "Booking access is temporarily unavailable. Please try again later.",
  rate: "Too many access requests. Please wait an hour before trying again.",
  expired: "Your booking session has expired. Enter your reference and booking email address to view your booking again.",
  change: "The session could not be changed. It may have been updated or the new time may conflict with another booking. Review the current details and try again.",
  availability: "We cannot confirm that time with the recorded availability. Try another date or time. New dates must be at least seven days ahead and within the next year."
};
const activeStatuses = new Set(["requested", "tentative", "applied", "ambassador_needed", "ambassador_assigned", "confirmed", "reschedule_requested", "withdrawal_requested"]);
const rescheduledStatusMessages: Record<string, string> = {
  requested: "Still pending approval.",
  pending: "Still pending approval.",
  tentative: "Still pending approval.",
  applied: "Still pending approval.",
  ambassador_needed: "Awaiting an ambassador.",
  ambassador_assigned: "Ambassador assigned. Awaiting confirmation.",
  confirmed: "Confirmed — your session is going ahead.",
  reschedule_requested: "A further reschedule request is awaiting approval.",
  withdrawal_requested: "An ambassador withdrawal request is being reviewed.",
  cancelled: "This session has since been cancelled.",
  declined: "This session has since been declined.",
  delivered: "This session has been completed.",
  completed_pending_report: "This session has been completed.",
  report_submitted: "This session has been completed.",
  payment_pending: "This session has been completed.",
  paid: "This session has been completed.",
  closed: "This session is now closed."
};

export default async function ManageBookingPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const verifying = params.verify === "1" && Boolean((await cookies()).get(CHALLENGE_COOKIE)?.value);
  let bookings: Awaited<ReturnType<typeof loadGuestBookings>> = null;
  let loadFailed = false;
  try { bookings = await loadGuestBookings(); } catch { loadFailed = true; }
  const error = typeof params.error === "string" ? messages[params.error] : null;
  return (
    <main className={`site-shell-narrow py-10 sm:py-14 ${!bookings ? "!max-w-[640px]" : ""}`}>
      <div className={`mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between ${!bookings ? "text-center" : ""}`}>
        <div className={`max-w-2xl ${!bookings ? "w-full" : ""}`}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800"><CalendarClock className="h-4 w-4" aria-hidden="true" />Your school sessions</div>
          <h1 className="text-4xl font-semibold tracking-tight text-[color:var(--navy)] sm:text-5xl">Manage your booking</h1>
          {!bookings ? <p className="mt-4 text-base leading-7 text-[color:var(--text-muted)]">View, reschedule or cancel your school sessions.</p> : null}
        </div>
        {bookings ? <form action={endBookingAccessAction} className="shrink-0"><PendingSubmitButton type="submit" variant="secondary"><LogOut className="h-4 w-4" aria-hidden="true" />Finish & exit</PendingSubmitButton></form> : null}
      </div>
      {error || loadFailed ? <p role="alert" className="mb-6 rounded-2xl bg-red-50 p-5 text-red-800">{loadFailed ? messages.unavailable : error}</p> : null}
      {params.success === "cancelled" || params.success === "rescheduled" ? <p role="status" className="mb-6 rounded-2xl bg-green-50 p-5 text-green-900">Your session has been {params.success}. We will email the booking contact with the updated details and notify the team and assigned ambassador.</p> : null}
      {!bookings && !loadFailed ? <Card className="overflow-hidden p-0 md:p-0">
        <div className="border-b border-green-100 bg-gradient-to-r from-green-50 to-sky-50 px-6 py-5 sm:px-8">
          <ol aria-label="Booking access steps" className="flex items-center gap-3 text-xs sm:text-sm">
            <li aria-current={!verifying ? "step" : undefined} className="flex items-center gap-2 text-green-800"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-700 text-xs font-semibold text-white">{verifying ? <Check className="h-4 w-4" aria-hidden="true" /> : "1"}</span>Your details</li>
            <li className="h-px min-w-4 flex-1 bg-green-200" aria-hidden="true" role="presentation" />
            <li aria-current={verifying ? "step" : undefined} className={`flex items-center gap-2 ${verifying ? "text-green-800" : "text-slate-500"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${verifying ? "bg-green-700 text-white" : "border border-slate-200 bg-white"}`}>2</span>Verify email</li>
          </ol>
        </div>
        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700">{verifying ? <Mail className="h-6 w-6" aria-hidden="true" /> : <Hash className="h-6 w-6" aria-hidden="true" />}</div>
          <h2 className="text-2xl font-semibold">{verifying ? "Check your inbox" : "Find your booking"}</h2>
          <p className="mt-2 text-sm font-normal leading-6 text-[color:var(--text-muted)]">{verifying ? "If your details match a booking, we’ll email you an eight-digit code." : "Use your booking reference and email. We’ll send a code to verify it’s you."}</p>
          {verifying ? <>
            <form action={verifyBookingAccessAction} className="mt-6 space-y-5">
              <label className="block text-sm font-medium" htmlFor="booking-verification-code">Verification code</label>
              <Input id="booking-verification-code" name="code" required minLength={8} maxLength={8} pattern="[0-9]{8}" inputMode="numeric" autoComplete="one-time-code" aria-describedby="code-expiry" className="!mt-2 h-14 text-center font-mono text-xl tracking-[0.25em] sm:tracking-[0.4em]" />
              <p id="code-expiry" className="!mt-2 flex items-center gap-1.5 text-xs text-[color:var(--text-muted)]"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Valid for 10 minutes. Keep this page open.</p>
              <PendingSubmitButton type="submit" className="min-h-12 w-full" pendingLabel="Verifying...">Verify & view booking<ArrowRight className="h-4 w-4" aria-hidden="true" /></PendingSubmitButton>
            </form>
            <div className="mt-6 border-t border-slate-100 pt-5 text-center">
              <p className="text-xs leading-5 text-[color:var(--text-muted)]">No code yet? Check your spam folder or try your details again.</p>
              <form action={endBookingAccessAction} className="mt-2"><PendingSubmitButton type="submit" variant="ghost" className="text-xs font-medium">Change details or request a new code</PendingSubmitButton></form>
            </div>
          </> : <form action={requestBookingAccessAction} className="mt-6 space-y-5">
            <div>
              <label htmlFor="booking-reference" className="block text-sm font-medium">6-digit booking reference</label>
              <Input id="booking-reference" name="reference" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" autoComplete="off" aria-describedby="reference-hint" className="mt-2 h-12 font-mono tracking-widest" />
              <p id="reference-hint" className="mt-1.5 text-xs text-[color:var(--text-muted)]">You’ll find this in your booking emails.</p>
            </div>
            <div>
              <label htmlFor="booking-email" className="block text-sm font-medium">Booking email address</label>
              <Input id="booking-email" name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} className="mt-2 h-12" />
            </div>
            <PendingSubmitButton type="submit" className="min-h-12 w-full" pendingLabel="Requesting code...">Send verification code<ArrowRight className="h-4 w-4" aria-hidden="true" /></PendingSubmitButton>
          </form>}
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 text-xs text-[color:var(--text-muted)]"><ShieldCheck className="h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />Private access. No account or password needed.</div>
      </Card> : null}
      {bookings ? <>
        {!bookings.length ? <Card>This booking is no longer available. Finish this session and enter your booking reference and email address again.</Card> : null}
        <div className="space-y-8">{bookings.map((booking) => <Card key={booking.id} className="overflow-hidden p-0 md:p-0">
          <div className="flex flex-wrap items-center justify-between gap-5 border-b border-green-100 bg-gradient-to-r from-green-50 via-[#f4faf7] to-sky-50 px-5 py-6 sm:px-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white bg-white/90 text-green-700 shadow-sm"><GraduationCap className="h-6 w-6" aria-hidden="true" /></div>
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-green-800">Your booking</p><h2 className="text-2xl font-semibold">{booking.schools?.name || "School booking"}</h2></div>
            </div>
            <div className="rounded-xl border border-white bg-white/80 px-4 py-2 text-sm"><span className="text-[color:var(--text-muted)]">Booking ref</span><strong className="ml-3 font-mono tracking-wider text-[color:var(--navy)]">{booking.reference_code || "Not recorded"}</strong></div>
          </div>
          <div className="divide-y divide-slate-200 px-5 sm:px-8">{booking.booking_sessions.map((session) => {
            const canChange = activeStatuses.has(session.status) && Date.parse(session.starts_at) > Date.now() + CHANGE_NOTICE_HOURS * 3600000;
            const canReschedule = canChange && !["reschedule_requested", "withdrawal_requested"].includes(session.status);
            const date = new Date(session.starts_at);
            const datePart = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-NZ", { ...options, timeZone: "Pacific/Auckland" }).format(date);
            const statusColour = ["confirmed", "ambassador_assigned", "delivered"].includes(session.status) ? "border-green-200 bg-green-50 text-green-800" : ["cancelled", "declined"].includes(session.status) ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900";
            return <section key={session.id} className="py-7 sm:py-8">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="w-16 shrink-0 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 text-center text-[color:var(--navy)] sm:w-20">
                  <div className="bg-blue-100/70 py-1.5 text-xs font-semibold uppercase tracking-wider">{datePart({ month: "short" })}</div>
                  <div className="py-2 text-3xl font-semibold">{datePart({ day: "numeric" })}</div>
                  <div className="pb-2 text-xs text-slate-600">{datePart({ year: "numeric" })}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusColour}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{session.status.replaceAll("_", " ")}</span></div>
                  <h3 className="text-xl font-semibold leading-snug text-[color:var(--navy)] sm:text-2xl">{session.presentation_types?.title || "NZ Esports presentation"}</h3>
                  {session.rescheduleHistory.length ? <div className="mt-3 flex items-start gap-2.5">
                    <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <div>
                      <p className="text-sm leading-6 text-[color:var(--text-muted)]">This session has already been rescheduled{session.rescheduleHistory[0].previousStartsAt ? <> from <strong className="font-medium">{formatDateTime(session.rescheduleHistory[0].previousStartsAt)}</strong></> : null} to <strong className="font-medium">{formatDateTime(session.rescheduleHistory[0].startsAt || session.starts_at)}</strong>.</p>
                      {!session.rescheduleHistory[0].previousStartsAt ? <p className="mt-1 text-xs text-[color:var(--text-muted)]">The previous date was not recorded.</p> : null}
                      <p className="mt-1 text-xs font-medium text-[color:var(--navy)]">{rescheduledStatusMessages[session.status] || `Current status: ${session.status.replaceAll("_", " ")}.`}</p>
                    </div>
                  </div> : null}
                </div>
              </div>
              <dl className="mt-6 grid gap-4 rounded-2xl bg-slate-50/90 p-5 text-sm sm:grid-cols-3 sm:gap-6">
                <div><dt className="mb-2 flex items-center gap-2 text-[color:var(--text-muted)]"><Clock3 className="h-4 w-4 text-blue-600" aria-hidden="true" />Time</dt><dd className="font-medium">{formatTime(session.starts_at)} – {formatTime(session.ends_at)}</dd></div>
                <div><dt className="mb-2 flex items-center gap-2 text-[color:var(--text-muted)]"><MapPin className="h-4 w-4 text-blue-600" aria-hidden="true" />Location</dt><dd className="break-words font-medium">{session.location_address || booking.schools?.name || "To be confirmed"}</dd></div>
                <div><dt className="mb-2 flex items-center gap-2 text-[color:var(--text-muted)]"><UserRound className="h-4 w-4 text-green-700" aria-hidden="true" />Your ambassador</dt><dd className="font-medium">{session.ambassador_profiles?.profiles?.full_name || session.ambassador_profiles?.display_name || "To be assigned"}</dd></div>
              </dl>
              {canChange ? <div className="mt-6 space-y-3">
                {canReschedule ? <details className="group rounded-2xl border border-blue-100 bg-blue-50/40 p-4 transition-colors open:bg-white sm:p-5">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><CalendarClock className="h-5 w-5" aria-hidden="true" /></span><span className="flex-1">Find a new time<span className="mt-0.5 block text-xs font-normal text-[color:var(--text-muted)]">Reschedule this session to suit your school</span></span><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                  <form action={changeGuestSessionAction} className="mt-4 space-y-4">
                    <input type="hidden" name="updatedAt" value={session.updated_at} /><input type="hidden" name="bookingId" value={booking.id} /><input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="action" value="reschedule" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-medium">New date<Input type="date" name="date" required min={minimumBookingDate()} max={maximumBookingDate()} className="mt-2" /></label>
                      <label className="text-sm font-medium">New start time (NZ)<Input type="time" name="time" required className="mt-2" /></label>
                    </div>
                    <label className="block text-sm font-medium">Notes (optional)<Textarea name="notes" maxLength={2000} className="mt-2" /></label>
                    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirmed" value="yes" required className="mt-1" />I want to move this session to the selected date and time.</label>
                    <PendingSubmitButton type="submit" pendingLabel="Checking and saving...">Confirm reschedule<ArrowRight className="h-4 w-4" aria-hidden="true" /></PendingSubmitButton>
                  </form>
                </details> : <p className="text-sm text-[color:var(--text-muted)]">A change is already being reviewed for this session. You can still cancel it below.</p>}
                <details className="group rounded-2xl border border-slate-200 p-4 sm:p-5">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg text-sm font-medium text-rose-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-600 [&::-webkit-details-marker]:hidden"><X className="h-4 w-4" aria-hidden="true" /><span className="flex-1">Cancel this session</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                  <p className="mt-3 text-sm">This cancels only this session. Other sessions in your booking remain in place.</p>
                  <form action={changeGuestSessionAction} className="mt-4 space-y-4">
                    <input type="hidden" name="updatedAt" value={session.updated_at} /><input type="hidden" name="bookingId" value={booking.id} /><input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="action" value="cancel" />
                    <label className="block text-sm font-medium">Reason (optional)<Textarea name="notes" maxLength={2000} className="mt-2" /></label>
                    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirmed" value="yes" required className="mt-1" />I understand this will cancel this session.</label>
                    <PendingSubmitButton type="submit" pendingLabel="Cancelling..." variant="danger">Confirm cancellation</PendingSubmitButton>
                  </form>
                </details>
              </div> : <p className="mt-4 text-sm text-[color:var(--text-muted)]">This session cannot be changed online. For changes within 24 hours of the session, please contact the team.</p>}
            </section>;
          })}</div>
        </Card>)}</div>
      </> : null}
      <div className={`mt-6 flex flex-col gap-4 sm:flex-row sm:items-center ${bookings ? "sm:justify-between" : "items-center sm:justify-center"}`}><ButtonLink href="/" variant="ghost"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to homepage</ButtonLink>{bookings ? <p className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]"><ShieldCheck className="h-4 w-4 text-green-700" aria-hidden="true" />All done? Finish & exit to keep your booking private.</p> : null}</div>
    </main>
  );
}
