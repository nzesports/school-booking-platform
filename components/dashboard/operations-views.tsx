import type { ReactNode } from "react";
import { ArrowRight, MessageSquareText, School2 } from "lucide-react";

import {
  assignAmbassadorAction,
  mergeSchoolAction,
  reviewSchoolFeedbackAction,
  saveManualBookingAction,
  saveManualSchoolAction,
  updateBookingStatusAction
} from "@/app/portal/actions";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  AmbassadorProfile,
  BookingRequestView,
  PresentationType,
  ReportSummary,
  School,
  SchoolFeedbackSummary
} from "@/lib/domain/types";
import {
  bookingLifecycleOptions,
  buildSchoolDeliverySummaries,
  filterBookingsByLifecycle,
  type BookingLifecycleView,
  type DashboardRange
} from "@/lib/services/dashboard-insights";
import { cn, formatDateTime, formatShortDate, formatTime, titleCase } from "@/lib/utils";

export function BookingLifecyclePanel({
  basePath,
  bookings,
  schools,
  presentations,
  ambassadors,
  activeView,
  range
}: {
  basePath: string;
  bookings: BookingRequestView[];
  schools: School[];
  presentations: PresentationType[];
  ambassadors: AmbassadorProfile[];
  activeView: BookingLifecycleView;
  range: DashboardRange;
}) {
  const filteredBookings = filterBookingsByLifecycle(bookings, activeView);
  const sessions = bookings.flatMap((booking) => booking.sessions);
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");

  return (
    <div className="grid gap-5">
      <Card className="rounded-[28px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Booking lifecycle
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-[color:var(--navy)]">
              Current, future, past, and cancelled bookings
            </h2>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <a
              href="#manual-booking-entry"
              className="inline-flex min-h-[40px] items-center justify-center rounded-[14px] border border-[#a2cae3] bg-[#afd5ed] px-3 py-2 text-sm font-semibold text-[color:var(--navy)]"
            >
              Log booking
            </a>
            {bookingLifecycleOptions.map((option) => (
              <ButtonLink
                key={option.value}
                href={`${basePath}/bookings?status=${option.value}&range=${range}`}
                variant={option.value === activeView ? "primary" : "secondary"}
                className="min-h-[40px] rounded-[14px] px-3 py-2 text-sm"
              >
                {option.label}
              </ButtonLink>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <SummaryTile label="Booking requests" value={String(bookings.length)} />
          <SummaryTile label="Sessions" value={String(sessions.length)} />
          <SummaryTile
            label="Assigned sessions"
            value={String(sessions.filter((session) => session.assignedAmbassadorName).length)}
          />
          <SummaryTile
            label="Reports submitted"
            value={String(sessions.filter((session) => session.reportStatus === "submitted" || session.reportStatus === "reviewed").length)}
          />
        </div>
      </Card>

      <Card id="manual-booking-entry" className="scroll-mt-8 rounded-[28px]">
        <details>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 marker:hidden">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                Manual entry
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-[color:var(--navy)]">
                Log a booking or delivered session
              </h3>
            </div>
            <span className="rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)]">
              Open form
            </span>
          </summary>
          <form action={saveManualBookingAction} className="mt-6 grid gap-4">
            <input type="hidden" name="returnTo" value={`${basePath}/bookings?status=${activeView}&range=${range}`} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="School">
                <select name="schoolId" required className={fieldClassName}>
                  <option value="">Select a school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Presentation">
                <select name="presentationTypeId" required className={fieldClassName}>
                  <option value="">Select a presentation</option>
                  {presentations.map((presentation) => (
                    <option key={presentation.id} value={presentation.id}>
                      {presentation.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 lg:grid-cols-4">
              <Field label="Date">
                <input type="date" name="date" required className={fieldClassName} />
              </Field>
              <Field label="Start time">
                <input type="time" name="startTime" required className={fieldClassName} />
              </Field>
              <Field label="Duration">
                <input type="number" name="durationMinutes" min={1} defaultValue={45} required className={fieldClassName} />
              </Field>
              <Field label="Status">
                <select name="status" defaultValue="confirmed" className={fieldClassName}>
                  <option value="tentative">Tentative</option>
                  <option value="ambassador_needed">Ambassador needed</option>
                  <option value="ambassador_assigned">Ambassador assigned</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed_pending_report">Delivered, report needed</option>
                  <option value="report_submitted">Delivered, report submitted</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Year groups">
                <input name="yearLevels" required className={fieldClassName} placeholder="Years 9 to 10" />
              </Field>
              <Field label="Expected students">
                <input type="number" name="expectedStudentCount" min={1} required className={fieldClassName} placeholder="120" />
              </Field>
              <Field label="Actual students">
                <input type="number" name="actualStudentCount" min={0} className={fieldClassName} placeholder="Optional" />
              </Field>
            </div>
            <Field label="Assigned ambassador">
              <select name="assignedAmbassadorId" defaultValue="" className={fieldClassName}>
                <option value="">Unassigned</option>
                {ambassadors
                  .filter((ambassador) => ambassador.status === "approved")
                  .map((ambassador) => (
                    <option key={ambassador.id} value={ambassador.id}>
                      {ambassador.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Referred by ambassador">
              <select name="outreachAmbassadorId" defaultValue="" className={fieldClassName}>
                <option value="">No ambassador referral</option>
                {approvedAmbassadors.map((ambassador) => (
                  <option key={ambassador.id} value={ambassador.id}>
                    {ambassador.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Internal notes">
              <textarea
                name="internalNotes"
                className="min-h-24 w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                placeholder="Source, context, delivery notes, or anything staff should know."
              />
            </Field>
            <button
              type="submit"
              className="inline-flex min-h-[46px] items-center justify-center rounded-[16px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)]"
            >
              Save booking
            </button>
          </form>
        </details>
      </Card>

      {filteredBookings.length > 0 ? (
        filteredBookings.map((booking) => (
          <Card key={booking.id} className="rounded-[28px]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  {titleCase(booking.source)} request
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-[color:var(--navy)]">
                  {booking.schoolName}
                </h3>
                <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                  {booking.primaryContactName} · {booking.primaryContactEmail} · {booking.regionSlug}
                </p>
              </div>
              <StatusBadge value={booking.status} />
            </div>

            <form
              action={updateBookingStatusAction}
              className="mt-5 grid gap-3 rounded-[20px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] p-4 lg:grid-cols-[0.75fr_1fr_auto]"
            >
              <input type="hidden" name="bookingRequestId" value={booking.id} />
              <input type="hidden" name="returnTo" value={`${basePath}/bookings?status=${activeView}&range=${range}`} />
              <select name="status" defaultValue={booking.status} className={fieldClassName}>
                <option value="tentative">Tentative</option>
                <option value="ambassador_needed">Ambassador needed</option>
                <option value="ambassador_assigned">Ambassador assigned</option>
                <option value="confirmed">Confirmed</option>
                <option value="reschedule_requested">Reschedule requested</option>
                <option value="cancel_requested">Cancel requested</option>
                <option value="completed_pending_report">Delivered, report needed</option>
                <option value="report_submitted">Report submitted</option>
                <option value="paid">Paid</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
                <option value="declined">Declined</option>
              </select>
              <input
                name="reason"
                className={fieldClassName}
                placeholder="Optional reason or internal note"
              />
              <button
                type="submit"
                className="inline-flex min-h-[46px] items-center justify-center rounded-[16px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)]"
              >
                Update status
              </button>
            </form>

            <div className="mt-5 overflow-hidden rounded-[18px] border border-[color:var(--border-soft)] bg-white/92">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    {["Date", "Presentation", "Year groups", "Ambassador", "Students", "Status"].map((heading) => (
                      <th
                        key={heading}
                        className="border-b border-[color:rgba(4,15,75,0.08)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {booking.sessions.map((session) => (
                    <tr key={session.id} className="align-top">
                      <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--navy)]">
                        {formatShortDate(session.startsAt)} · {formatTime(session.startsAt)}
                      </td>
                      <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm font-semibold text-[color:var(--navy)]">
                        {session.presentationTitle}
                      </td>
                      <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--text-soft)]">
                        {session.yearLevels}
                      </td>
                      <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--text-soft)]">
                        <form action={assignAmbassadorAction} className="grid min-w-52 gap-2">
                          <input type="hidden" name="bookingSessionId" value={session.id} />
                          <input type="hidden" name="returnTo" value={`${basePath}/bookings?status=${activeView}&range=${range}`} />
                          <select
                            name="ambassadorProfileId"
                            defaultValue=""
                            className="min-h-[40px] rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3 text-sm text-[color:var(--navy)]"
                          >
                            <option value="">
                              {session.assignedAmbassadorName ?? "Assign ambassador"}
                            </option>
                            {approvedAmbassadors.map((ambassador) => (
                              <option key={ambassador.id} value={ambassador.id}>
                                {ambassador.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="inline-flex min-h-[36px] items-center justify-center rounded-[12px] border border-[color:rgba(4,15,75,0.12)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)]"
                          >
                            Assign
                          </button>
                        </form>
                      </td>
                      <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--text-soft)]">
                        {session.actualStudentCount ?? session.expectedStudentCount}
                      </td>
                      <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                        <StatusBadge value={session.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      ) : (
        <EmptyPanel copy="No bookings match this lifecycle view yet." />
      )}
    </div>
  );
}

export function SchoolDeliveryDatabase({
  schools,
  bookings,
  regions,
  basePath
}: {
  schools: School[];
  bookings: BookingRequestView[];
  regions: Array<{ id: string; name: string; slug: string; isActive: boolean }>;
  basePath: string;
}) {
  const summaries = buildSchoolDeliverySummaries(schools, bookings);
  const reachedSchools = summaries.filter((summary) => summary.deliveredCount > 0);
  const schoolsWithGaps = summaries.filter(
    (summary) => summary.deliveredCount > 0 && summary.yearGroupGaps.length > 0
  );
  const pendingReviewSchools = schools.filter((school) => school.status === "pending_review");
  const mergeTargetSchools = schools.filter((school) => school.status === "active");

  return (
    <div className="grid gap-5">
      <Card className="rounded-[28px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
            School database
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-[color:var(--navy)]">
            Delivery history and year-group coverage
          </h2>
        </div>
        <a
          href="#manual-school-entry"
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[14px] border border-[#a2cae3] bg-[#afd5ed] px-4 py-2 text-sm font-semibold text-[color:var(--navy)]"
        >
          <School2 className="h-4 w-4" />
          Add school
        </a>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <SummaryTile label="Schools presented to" value={String(reachedSchools.length)} />
        <SummaryTile label="Schools with gaps" value={String(schoolsWithGaps.length)} />
        <SummaryTile
          label="Upcoming school sessions"
          value={String(summaries.reduce((total, summary) => total + summary.upcomingCount, 0))}
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-[18px] border border-[color:var(--border-soft)] bg-white/92">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {["School", "Delivered", "Presentations", "Year groups reached", "Gaps", "Next"].map((heading) => (
                <th
                  key={heading}
                  className="border-b border-[color:rgba(4,15,75,0.08)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={summary.school.id} className="align-top">
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4">
                  <p className="font-semibold text-[color:var(--navy)]">{summary.school.name}</p>
                  <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                    {summary.school.city} · {summary.school.regionSlug}
                  </p>
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--text-soft)]">
                  {summary.deliveredCount} sessions
                  <span className="block text-xs">Last: {summary.lastDeliveredLabel}</span>
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--text-soft)]">
                  {summary.presentationsDelivered.length > 0
                    ? summary.presentationsDelivered.join(", ")
                    : "Not yet delivered"}
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--text-soft)]">
                  {summary.yearGroupsReachedLabel}
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                      summary.yearGroupGaps.length > 0
                        ? "bg-[#fff7e8] text-[#9a5a00]"
                        : "bg-[color:var(--green-soft)] text-[color:var(--green)]"
                    )}
                  >
                    {summary.yearGroupGapsLabel}
                  </span>
                </td>
                <td className="border-b border-[color:rgba(4,15,75,0.06)] px-4 py-4 text-sm text-[color:var(--text-soft)]">
                  {summary.nextSessionLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Card>

      {pendingReviewSchools.length > 0 && mergeTargetSchools.length > 0 ? (
        <Card className="rounded-[28px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)]">
          <SectionTitle title="Pending school merges" />
          <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
            New school signups without an existing contact match are held for review. Merge a
            duplicate into the correct active school after checking the details.
          </p>
          <div className="mt-5 grid gap-3">
            {pendingReviewSchools.map((school) => (
              <form
                key={school.id}
                action={mergeSchoolAction}
                className="grid gap-3 rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 p-4 lg:grid-cols-[1fr_1fr_auto]"
              >
                <input type="hidden" name="duplicateSchoolId" value={school.id} />
                <input type="hidden" name="returnTo" value={`${basePath}/schools`} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                    Pending duplicate
                  </p>
                  <p className="mt-1 font-semibold text-[color:var(--navy)]">{school.name}</p>
                  <p className="text-sm text-[color:var(--text-soft)]">{school.city}</p>
                </div>
                <select name="targetSchoolId" required className={fieldClassName}>
                  <option value="">Merge into...</option>
                  {mergeTargetSchools.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="inline-flex min-h-[46px] items-center justify-center rounded-[16px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)]"
                >
                  Merge school
                </button>
              </form>
            ))}
          </div>
        </Card>
      ) : null}

      <Card id="manual-school-entry" className="scroll-mt-8 rounded-[28px]">
      <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 marker:hidden">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Manual entry
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-[color:var(--navy)]">
              Add a school to the database
            </h3>
          </div>
          <span className="rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)]">
            Open form
          </span>
        </summary>
        <form action={saveManualSchoolAction} className="mt-6 grid gap-4">
          <input type="hidden" name="returnTo" value={`${basePath}/schools`} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="School name">
              <input name="name" required className={fieldClassName} placeholder="Harbour Secondary College" />
            </Field>
            <Field label="Region">
              <select name="regionId" defaultValue="" className={fieldClassName}>
                <option value="">Select a region</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            <Field label="City">
              <input name="city" className={fieldClassName} placeholder="Auckland" />
            </Field>
            <Field label="Postcode">
              <input name="postcode" className={fieldClassName} placeholder="1010" />
            </Field>
            <Field label="Roll size">
              <input type="number" name="rollSize" min={0} className={fieldClassName} placeholder="900" />
            </Field>
            <Field label="Website">
              <input name="website" className={fieldClassName} placeholder="https://school.nz" />
            </Field>
          </div>
          <Field label="Address">
            <input name="address" className={fieldClassName} placeholder="Street address" />
          </Field>
          <div className="grid gap-4 lg:grid-cols-4">
            <Field label="Primary contact">
              <input name="contactName" className={fieldClassName} placeholder="Jules Morgan" />
            </Field>
            <Field label="Contact email">
              <input type="email" name="contactEmail" className={fieldClassName} placeholder="jules@school.nz" />
            </Field>
            <Field label="Contact phone">
              <input name="contactPhone" className={fieldClassName} placeholder="+64 21 000 000" />
            </Field>
            <Field label="Position">
              <input name="contactPosition" className={fieldClassName} placeholder="Careers lead" />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              name="notes"
              className="min-h-24 w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
              placeholder="Anything useful for future bookings."
            />
          </Field>
          <label className="flex items-center gap-3 rounded-[16px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-3 text-sm text-[color:var(--navy)]">
            <input type="checkbox" name="marketingConsent" />
            Contact opted in to school resources and updates
          </label>
          <button
            type="submit"
            className="inline-flex min-h-[46px] items-center justify-center rounded-[16px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)]"
          >
            Save school
          </button>
        </form>
      </details>
      </Card>
    </div>
  );
}

export function FeedbackWorkspace({
  reports,
  schoolReviews,
  returnTo,
  presentationFilterId
}: {
  reports: ReportSummary[];
  schoolReviews: SchoolFeedbackSummary[];
  returnTo: string;
  presentationFilterId?: string;
}) {
  const visibleReports = presentationFilterId
    ? reports.filter((report) => report.presentationTypeId === presentationFilterId)
    : reports;
  const visibleSchoolReviews = presentationFilterId
    ? schoolReviews.filter((review) => review.presentationTypeId === presentationFilterId)
    : schoolReviews;
  const reportRatings = visibleReports
    .map((report) => report.teacherResponseRating)
    .filter((rating): rating is number => typeof rating === "number");
  const schoolRatings = visibleSchoolReviews
    .map((review) => review.rating)
    .filter((rating): rating is number => typeof rating === "number");
  const allRatings = [...reportRatings, ...schoolRatings];
  const averageRating =
    allRatings.length > 0
      ? Math.round((allRatings.reduce((total, rating) => total + rating, 0) / allRatings.length) * 10) / 10
      : 0;

  return (
    <div className="grid gap-5">
      <Card className="rounded-[28px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Feedback
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-[color:var(--navy)]">
              School and ambassador feedback
            </h2>
          </div>
          <MessageSquareText className="h-8 w-8 text-[color:var(--green)]" />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <SummaryTile label="Average rating" value={averageRating ? `${averageRating}/5` : "No ratings"} />
          <SummaryTile label="School reviews" value={String(visibleSchoolReviews.length)} />
          <SummaryTile label="Ambassador reports" value={String(visibleReports.length)} />
          <SummaryTile
            label="Awaiting review"
            value={String(visibleReports.filter((report) => report.status === "submitted").length)}
          />
        </div>
      </Card>

      <div className="grid gap-5 2xl:grid-cols-2">
        <Card className="rounded-[28px]">
          <SectionTitle title="School feedback" />
          <div className="mt-5 grid gap-4">
            {visibleSchoolReviews.length > 0 ? (
              visibleSchoolReviews.map((review) => (
                <FeedbackCard
                  key={review.id}
                  title={review.schoolName}
                  subtitle={`${review.presentationTitle} · ${formatShortDate(review.createdAt)}`}
                  rating={review.rating}
                  body={review.quote}
                  meta={review.attribution ?? "School contact"}
                  status={review.isApproved ? "reviewed" : "submitted"}
                  badge={
                    review.isApproved && review.isPublic ? (
                      <span className="rounded-full bg-[#eaf8ee] px-3 py-1 text-xs font-semibold text-[#117a2e]">
                        Public
                      </span>
                    ) : null
                  }
                >
                  <form action={reviewSchoolFeedbackAction} className="mt-4 flex flex-wrap items-center gap-3">
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <label className="flex items-center gap-2 rounded-full bg-[color:var(--blue-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--navy)]">
                      <input
                        type="checkbox"
                        name="makePublic"
                        defaultChecked={review.isPublic && review.isApproved}
                      />
                      Show on website
                    </label>
                    <button
                      type="submit"
                      name="decision"
                      value="approve"
                      className="inline-flex min-h-[36px] items-center justify-center rounded-[12px] border border-[#95d2ab] bg-[#eaf8ee] px-3 py-1.5 text-xs font-semibold text-[#117a2e]"
                    >
                      Approve
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="unapprove"
                      className="inline-flex min-h-[36px] items-center justify-center rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)]"
                    >
                      Unapprove
                    </button>
                  </form>
                </FeedbackCard>
              ))
            ) : (
              <EmptyPanel copy="No school feedback has been submitted yet." />
            )}
          </div>
        </Card>

        <Card className="rounded-[28px]">
          <SectionTitle title="Ambassador reports" />
          <div className="mt-5 grid gap-4">
            {visibleReports.length > 0 ? (
              visibleReports.map((report) => (
                <FeedbackCard
                  key={report.id}
                  title={report.schoolName}
                  subtitle={`${report.presentationTitle} · ${formatDateTime(report.submittedAt)}`}
                  rating={report.teacherResponseRating}
                  body={
                    report.notableQuestions
                      ? `${report.presentationFeedback ?? "No written feedback was added to this report."}\n\nNotable questions: ${report.notableQuestions}`
                      : report.presentationFeedback ?? "No written feedback was added to this report."
                  }
                  meta={`${report.ambassadorName ?? "Ambassador"} · ${report.yearLevels ?? "Year groups not recorded"} · ${report.attendeeCount} attendees · Engagement ${report.studentEngagementRating ?? "not rated"}/5`}
                  status={report.status === "reviewed" ? "reviewed" : "submitted"}
                />
              ))
            ) : (
              <EmptyPanel copy="No ambassador reports have been submitted yet." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function FeedbackCard({
  title,
  subtitle,
  rating,
  body,
  meta,
  status,
  badge,
  children
}: {
  title: string;
  subtitle: string;
  rating?: number;
  body: string;
  meta: string;
  status: "submitted" | "reviewed";
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[color:var(--navy)]">{title}</p>
          <p className="mt-1 text-sm text-[color:var(--text-soft)]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          <StatusBadge value={status} />
        </div>
      </div>
      <p className="mt-4 text-sm leading-7 text-[color:var(--text-soft)]">{body}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-[color:var(--text-soft)]">{meta}</span>
        {rating ? (
          <span className="rounded-full bg-[#fff8e8] px-3 py-1 text-xs font-semibold text-[#9a5a00]">
            {rating}/5
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-2xl font-semibold text-[color:var(--navy)]">{title}</h3>
      <ArrowRight className="h-4 w-4 text-[color:var(--green)]" />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4">
      <p className="text-sm text-[color:var(--text-soft)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[color:var(--navy)]">{value}</p>
    </div>
  );
}

const fieldClassName =
  "w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm text-[color:var(--text-dark)]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--navy)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyPanel({ copy }: { copy: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[color:var(--border-soft)] bg-white/80 px-5 py-8 text-sm text-[color:var(--text-soft)]">
      {copy}
    </div>
  );
}
