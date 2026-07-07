import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck2,
  FileText,
  School2,
  UserRound,
  UsersRound
} from "lucide-react";

import {
  assignAmbassadorAction,
  mergeSchoolAction,
  removeBookingInternalNoteAction,
  resolveSessionWithdrawalAction,
  saveManualBookingAction,
  saveManualSchoolAction,
  updateBookingStatusAction
} from "@/app/portal/actions";
import { BookingsExplorer } from "@/components/dashboard/bookings-explorer";
import { ManualBookingDialog } from "@/components/dashboard/manual-booking-dialog";
import { SchoolsExplorer } from "@/components/dashboard/schools-explorer";
import { Card } from "@/components/ui/card";
import type {
  AmbassadorProfile,
  BookingRequestView,
  PresentationType,
  School
} from "@/lib/domain/types";
import {
  bookingLifecycleOptions,
  buildSchoolDeliverySummaries,
  filterBookingsByLifecycle,
  type BookingLifecycleView,
  type DashboardRange
} from "@/lib/services/dashboard-insights";
import { cn } from "@/lib/utils";

export function BookingLifecyclePanel({
  basePath,
  bookings,
  schools,
  presentations,
  ambassadors,
  activeView,
  range,
  initialQuery,
  initialBookingId
}: {
  basePath: string;
  bookings: BookingRequestView[];
  schools: School[];
  presentations: PresentationType[];
  ambassadors: AmbassadorProfile[];
  activeView: BookingLifecycleView;
  range: DashboardRange;
  initialQuery?: string;
  initialBookingId?: string;
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
      <ManualBookingDialog
        basePath={basePath}
        schools={schools}
        presentations={presentations}
        ambassadors={ambassadors}
        activeView={activeView}
        range={range}
        action={saveManualBookingAction}
      />

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
        removeInternalNoteAction={removeBookingInternalNoteAction}
        assignAmbassadorAction={assignAmbassadorAction}
        resolveWithdrawalAction={resolveSessionWithdrawalAction}
        initialQuery={initialQuery}
        initialBookingId={initialBookingId}
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
              contactName:
                summary.school.contactName ?? contactBySchoolId.get(summary.school.id) ?? null,
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

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-2xl font-semibold text-[color:var(--navy)]">{title}</h3>
      <ArrowRight className="h-4 w-4 text-[color:var(--green)]" />
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


