import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  CirclePlus,
  FileText,
  MessageSquareText,
  NotebookPen,
  School2,
  UserRound,
  UsersRound
} from "lucide-react";

import {
  assignAmbassadorAction,
  mergeSchoolAction,
  reviewSchoolFeedbackAction,
  saveManualBookingAction,
  saveManualSchoolAction,
  updateBookingStatusAction
} from "@/app/portal/actions";
import { BookingsExplorer } from "@/components/dashboard/bookings-explorer";
import { SchoolsExplorer } from "@/components/dashboard/schools-explorer";
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
import { cn, formatDateTime, formatShortDate } from "@/lib/utils";

export function BookingLifecyclePanel({
  basePath,
  bookings,
  schools,
  presentations,
  ambassadors,
  activeView,
  range,
  initialQuery
}: {
  basePath: string;
  bookings: BookingRequestView[];
  schools: School[];
  presentations: PresentationType[];
  ambassadors: AmbassadorProfile[];
  activeView: BookingLifecycleView;
  range: DashboardRange;
  initialQuery?: string;
}) {
  const filteredBookings = filterBookingsByLifecycle(bookings, activeView);
  const sessions = bookings.flatMap((booking) => booking.sessions);
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");
  const assignedCount = sessions.filter((session) => session.assignedAmbassadorName).length;
  const reportsCount = sessions.filter(
    (session) => session.reportStatus === "submitted" || session.reportStatus === "reviewed"
  ).length;

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <a
          href="#manual-booking-entry"
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] border border-[#c4dbfb] bg-white px-4 text-sm font-semibold text-[#1e4fae] shadow-[0_10px_24px_rgba(37,99,235,0.1)] transition hover:bg-[#f4f8ff]"
        >
          <CirclePlus className="h-4 w-4" />
          Log booking
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#18a83b]"
          icon={<CalendarCheck2 className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          label="Booking requests"
          value={String(bookings.length)}
          hint="Total requests received"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#18a83b]"
          icon={<UsersRound className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          label="Sessions"
          value={String(sessions.length)}
          hint="Total sessions requested"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#2563eb]"
          icon={<UserRound className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
          label="Assigned sessions"
          value={String(assignedCount)}
          hint="Sessions with ambassadors"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#7c3aed]"
          icon={<FileText className="h-5 w-5" />}
          iconClassName="bg-[#f1edfd] text-[#7c3aed]"
          label="Reports submitted"
          value={String(reportsCount)}
          hint="Reports submitted this period"
        />
      </div>

      <details
        id="manual-booking-entry"
        className="group scroll-mt-8 overflow-hidden rounded-[22px] border border-[rgba(24,168,59,0.18)] bg-[linear-gradient(120deg,#eefaf2,#eef5fd)] shadow-[0_18px_42px_rgba(11,24,77,0.07)]"
      >
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/40 marker:hidden md:px-6">
          <span className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white text-[#117a2e] shadow-[0_12px_26px_rgba(24,168,59,0.18)]">
              <NotebookPen className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                Manual entry
              </span>
              <span className="block text-sm text-[color:var(--text-soft)]">
                Log a phone booking or an already-delivered session without going through the
                public form.
              </span>
            </span>
          </span>
          <span className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] border border-[#2563eb] bg-[#2563eb] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)] transition group-open:border-[color:var(--border-soft)] group-open:bg-white group-open:text-[color:var(--navy)] group-open:shadow-none">
            <CirclePlus className="h-4 w-4 transition group-open:rotate-45" />
            <span className="group-open:hidden">Open form</span>
            <span className="hidden group-open:inline">Close form</span>
          </span>
        </summary>
        <div className="border-t border-[rgba(4,15,75,0.07)] bg-white/75 px-5 pb-6 pt-5 md:px-6">
          <form action={saveManualBookingAction} className="grid gap-4">
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
              className="inline-flex min-h-[46px] items-center justify-center justify-self-start rounded-[14px] border border-[#2563eb] bg-[#2563eb] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)] transition hover:bg-[#1d4fd7]"
            >
              Save booking
            </button>
          </form>
        </div>
      </details>

      <BookingsExplorer
        bookings={filteredBookings}
        allBookings={bookings}
        basePath={basePath}
        activeView={activeView}
        range={range}
        lifecycleTabs={bookingLifecycleOptions.map((option) => ({
          value: option.value,
          label: option.label
        }))}
        ambassadors={approvedAmbassadors.map((ambassador) => ({
          id: ambassador.id,
          name: ambassador.name
        }))}
        presentationTitles={presentations.map((presentation) => presentation.title)}
        updateStatusAction={updateBookingStatusAction}
        assignAmbassadorAction={assignAmbassadorAction}
        initialQuery={initialQuery}
      />
    </div>
  );
}

function LifecycleStatTile({
  accentClassName,
  icon,
  iconClassName,
  label,
  value,
  hint
}: {
  accentClassName: string;
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 p-5",
        accentClassName
      )}
    >
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", iconClassName)}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-[color:var(--text-soft)]">{label}</span>
        <span className="block text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {value}
        </span>
        <span className="block text-xs text-[color:var(--text-soft)]">{hint}</span>
      </span>
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
  const pendingReviewSchools = schools.filter((school) => school.status === "pending_review");
  const mergeTargetSchools = schools.filter((school) => school.status === "active");
  // Latest booking contact per school, used as the "teacher" line in the table.
  const contactBySchoolId = new Map<string, string>();

  for (const booking of [...bookings].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )) {
    const schoolId = booking.sessions[0]?.schoolId;

    if (schoolId && booking.primaryContactName) {
      contactBySchoolId.set(schoolId, booking.primaryContactName);
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="rounded-[28px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              School database
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
              School records and delivery history
            </h2>
          </div>
          <a
            href="#manual-school-entry"
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] border border-[#c4dbfb] bg-[#e8f1fd] px-4 py-2 text-sm font-semibold text-[#1e4fae] transition hover:bg-[#dcebfc]"
          >
            <School2 className="h-4 w-4" />
            Add school
          </a>
        </div>

        <div className="mt-6">
          <SchoolsExplorer
            summaries={summaries.map((summary) => ({
              school: summary.school,
              contactName: contactBySchoolId.get(summary.school.id) ?? null,
              deliveredCount: summary.deliveredCount,
              upcomingCount: summary.upcomingCount,
              presentationsDelivered: summary.presentationsDelivered,
              yearGroupsReached: summary.yearGroupsReached,
              lastDeliveredLabel: summary.lastDeliveredLabel,
              nextSessionLabel: summary.nextSessionLabel,
              lastDeliveredAt: summary.lastDeliveredAt,
              nextSessionAt: summary.nextSessionAt
            }))}
            regions={regions.map((region) => ({ slug: region.slug, name: region.name }))}
            bookings={bookings}
            basePath={basePath}
          />
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
