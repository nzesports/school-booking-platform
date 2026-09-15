import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CalendarCheck,
  CheckCircle2,
  FileText,
  ListOrdered,
  Mail,
  MapPin,
  Phone,
  Search,
  Star,
  UserPlus,
  UserRoundCheck,
  UserRoundX
} from "lucide-react";

import { AmbassadorDeleteDialog } from "@/components/dashboard/ambassador-delete-dialog";
import { DataTable } from "@/components/dashboard/data-table";
import { ReportDetailsButton } from "@/components/dashboard/report-details-dialog";
import { SchoolFeedbackDetailsButton } from "@/components/dashboard/school-feedback-details-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  AmbassadorProfile,
  BookingRequestView,
  BookingSessionView,
  PaymentRecord,
  ReportSummary,
  SchoolFeedbackSummary
} from "@/lib/domain/types";
import {
  cn,
  formatCurrency,
  formatDateTime,
  initials,
  titleCase
} from "@/lib/utils";

type AmbassadorTab = "profiles" | "applications";
export type VolunteerDirectoryStatus = "active" | "inactive";
export type VolunteerDirectorySort = "asc" | "desc";
export type AmbassadorProfileSection =
  | "overview"
  | "presentations"
  | "reports"
  | "sourced"
  | "feedback"
  | "payments";

type WorkspaceProps = {
  ambassadors: AmbassadorProfile[];
  bookings: BookingRequestView[];
  reports: ReportSummary[];
  schoolReviews: SchoolFeedbackSummary[];
  payments: PaymentRecord[];
  activeTab: AmbassadorTab;
  directoryStatus: VolunteerDirectoryStatus;
  directoryQuery: string;
  directorySort: VolunteerDirectorySort;
  basePath: string;
};

type ProfileProps = Omit<
  WorkspaceProps,
  "activeTab" | "ambassadors" | "directoryStatus" | "directoryQuery" | "directorySort"
> & {
  ambassador: AmbassadorProfile;
  activeSection: AmbassadorProfileSection;
  reviewAction: (formData: FormData) => void | Promise<void>;
  connectAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
};

const deliveredStatuses = new Set(["completed_pending_report", "closed"]);
const outstandingPaymentStatuses = new Set(["pending", "approved"]);

export function AmbassadorsWorkspace({
  ambassadors,
  bookings,
  reports,
  schoolReviews,
  activeTab,
  directoryStatus,
  directoryQuery,
  directorySort,
  basePath
}: WorkspaceProps) {
  const profiles = ambassadors.filter(
    (ambassador) => ambassador.status === "approved" || ambassador.status === "inactive"
  );
  const applications = ambassadors.filter(
    (ambassador) => ambassador.status === "applied" || ambassador.status === "declined"
  );
  const activeProfiles = profiles.filter((ambassador) => ambassador.status === "approved");
  const inactiveProfiles = profiles.filter((ambassador) => ambassador.status === "inactive");
  const normalizedQuery = directoryQuery.trim().toLocaleLowerCase();
  const statusProfiles = directoryStatus === "active" ? activeProfiles : inactiveProfiles;
  const filteredProfiles = normalizedQuery
    ? statusProfiles.filter((ambassador) =>
        [
          ambassador.name,
          ambassador.email,
          ambassador.phone,
          ambassador.regionName,
          ambassador.regionSlug,
          ...ambassador.travelRegions
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
      )
    : statusProfiles;
  const sortDirection = directorySort === "asc" ? 1 : -1;
  const visibleProfiles = [...filteredProfiles].sort(
    (left, right) =>
      left.name.localeCompare(right.name, "en", { sensitivity: "base" }) * sortDirection
  );
  const sessions = bookings.flatMap((booking) => booking.sessions);
  const deliveredByAmbassador = new Map<string, BookingSessionView[]>();
  const reportSessionIdsByAmbassador = new Map<string, Set<string>>();
  const reviewsBySessionId = new Map<string, SchoolFeedbackSummary[]>();
  const sourcedSchoolsByAmbassador = new Map<string, Set<string>>();

  for (const session of sessions) {
    if (session.assignedAmbassadorId && deliveredStatuses.has(session.status)) {
      deliveredByAmbassador.set(session.assignedAmbassadorId, [
        ...(deliveredByAmbassador.get(session.assignedAmbassadorId) ?? []),
        session
      ]);
    }
  }

  for (const report of reports) {
    if (!report.ambassadorProfileId || !report.bookingSessionId) {
      continue;
    }

    const sessionIds = reportSessionIdsByAmbassador.get(report.ambassadorProfileId) ?? new Set();
    sessionIds.add(report.bookingSessionId);
    reportSessionIdsByAmbassador.set(report.ambassadorProfileId, sessionIds);
  }

  for (const review of schoolReviews) {
    if (review.bookingSessionId) {
      reviewsBySessionId.set(review.bookingSessionId, [
        ...(reviewsBySessionId.get(review.bookingSessionId) ?? []),
        review
      ]);
    }
  }

  for (const booking of bookings) {
    if (!booking.sourcedByAmbassadorId) {
      continue;
    }

    const schoolNames =
      sourcedSchoolsByAmbassador.get(booking.sourcedByAmbassadorId) ?? new Set<string>();
    schoolNames.add(booking.schoolName);
    sourcedSchoolsByAmbassador.set(booking.sourcedByAmbassadorId, schoolNames);
  }

  return (
    <div className="grid gap-5">
      <AmbassadorTabs
        basePath={basePath}
        activeTab={activeTab}
        profileCount={profiles.length}
        applicationCount={applications.length}
      />

      {activeTab === "profiles" ? (
        <DataTable
          title="Volunteer directory"
          columns={[
            "Volunteer",
            "Region",
            "Presentations",
            "Schools sourced",
            "School feedback",
            "Health",
            "Status",
            "Action"
          ]}
          headerContent={
            <VolunteerDirectoryControls
              basePath={basePath}
              activeStatus={directoryStatus}
              query={directoryQuery}
              sort={directorySort}
              activeCount={activeProfiles.length}
              inactiveCount={inactiveProfiles.length}
            />
          }
          emptyMessage={
            normalizedQuery
              ? `No ${directoryStatus} ambassadors match “${directoryQuery.trim()}”.`
              : `No ${directoryStatus} ambassadors to show.`
          }
          rows={visibleProfiles.map((ambassador) => {
            const delivered = deliveredByAmbassador.get(ambassador.id) ?? [];
            const deliveredSessionIds = new Set(delivered.map((session) => session.id));
            const submittedReports = [...(reportSessionIdsByAmbassador.get(ambassador.id) ?? [])]
              .filter((sessionId) => deliveredSessionIds.has(sessionId)).length;
            const ambassadorSchoolReviews = delivered.flatMap(
              (session) => reviewsBySessionId.get(session.id) ?? []
            );
            const schoolRating = average(
              ambassadorSchoolReviews
                .map((review) => review.rating)
                .filter((rating): rating is number => typeof rating === "number")
            );
            const sourcedSchools = sourcedSchoolsByAmbassador.get(ambassador.id) ?? new Set();
            const health = volunteerHealth(
              schoolRating,
              delivered.length > 0 ? submittedReports / delivered.length : null
            );

            return [
              <AmbassadorIdentity key={`${ambassador.id}-identity`} ambassador={ambassador} />,
              ambassador.regionName ?? titleCase(ambassador.regionSlug),
              String(delivered.length),
              String(sourcedSchools.size),
              schoolRating === null
                ? "No linked feedback"
                : `${schoolRating.toFixed(1)}/5 (${ambassadorSchoolReviews.length})`,
              <HealthBadge key={`${ambassador.id}-health`} health={health} />,
              <StatusBadge
                key={`${ambassador.id}-status`}
                value={ambassador.status === "approved" ? "confirmed" : "restricted"}
                label={
                  ambassador.status === "approved"
                    ? "Active"
                    : "Inactive"
                }
              />,
              <ButtonLink
                key={`${ambassador.id}-action`}
                href={`${basePath}/${ambassador.id}`}
                variant="ghost"
                className="min-h-[38px] rounded-[14px] px-3 py-1.5"
              >
                View profile
              </ButtonLink>
            ];
          })}
        />
      ) : (
        <DataTable
          title="Ambassador applications"
          columns={["Applicant", "Region", "Travel", "Status", "Action"]}
          emptyMessage="No ambassador applications are waiting for review."
          rows={applications.map((ambassador) => [
            <AmbassadorIdentity key={`${ambassador.id}-identity`} ambassador={ambassador} />,
            ambassador.regionName ?? titleCase(ambassador.regionSlug),
            travelLabel(ambassador),
            <StatusBadge
              key={`${ambassador.id}-status`}
              value={ambassador.status === "applied" ? "tentative" : "declined"}
              label={ambassador.status === "applied" ? "Awaiting review" : "Declined"}
            />,
            <ButtonLink
              key={`${ambassador.id}-action`}
              href={`${basePath}/${ambassador.id}`}
              variant="ghost"
              className="min-h-[38px] rounded-[14px] px-3 py-1.5"
            >
              {ambassador.status === "applied" ? "Review application" : "View application"}
            </ButtonLink>
          ])}
        />
      )}
    </div>
  );
}

export function AmbassadorProfileWorkspace({
  ambassador,
  bookings,
  reports,
  schoolReviews,
  payments,
  basePath,
  activeSection,
  reviewAction,
  connectAction,
  deleteAction
}: ProfileProps) {
  const isApplication = ambassador.status === "applied" || ambassador.status === "declined";
  const allSessions = bookings.flatMap((booking) => booking.sessions);
  const sessionsById = new Map(allSessions.map((session) => [session.id, session]));
  const deliveredSessions = allSessions
    .filter(
      (session) =>
        session.assignedAmbassadorId === ambassador.id && deliveredStatuses.has(session.status)
    )
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime());
  const ambassadorReports = reports
    .filter((report) => report.ambassadorProfileId === ambassador.id)
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime());
  const reportsBySessionId = new Map(
    ambassadorReports
      .filter((report) => report.bookingSessionId)
      .map((report) => [report.bookingSessionId as string, report])
  );
  const reviewsBySessionId = new Map(
    schoolReviews
      .filter((review) => review.bookingSessionId)
      .map((review) => [review.bookingSessionId as string, review])
  );
  const linkedSchoolReviews = deliveredSessions
    .map((session) => ({ session, review: reviewsBySessionId.get(session.id) }))
    .filter(
      (item): item is { session: BookingSessionView; review: SchoolFeedbackSummary } =>
        Boolean(item.review)
    );
  const submittedReportCount = deliveredSessions.filter(
    (session) => reportsBySessionId.has(session.id) || ["submitted", "reviewed"].includes(session.reportStatus)
  ).length;
  const averageRating = average(
    linkedSchoolReviews
      .map(({ review }) => review.rating)
      .filter((rating): rating is number => typeof rating === "number")
  );
  const ambassadorPayments = payments.filter(
    (payment) => payment.ambassadorProfileId === ambassador.id
  );
  const outstandingPayments = ambassadorPayments.filter((payment) =>
    outstandingPaymentStatuses.has(payment.status)
  );
  const outstandingCents = outstandingPayments.reduce(
    (total, payment) => total + payment.amountCents,
    0
  );
  const sourcedBookings = bookings
    .filter((booking) => booking.sourcedByAmbassadorId === ambassador.id)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const sourcedSchoolCount = new Set(sourcedBookings.map((booking) => booking.schoolName)).size;
  const sourcingBonusCents = ambassadorPayments.reduce(
    (total, payment) => total + payment.sourcingBonusCents,
    0
  );
  const totalEarningsCents = ambassadorPayments.reduce(
    (total, payment) => total + payment.amountCents,
    0
  );
  const recordType = isApplication ? "application" : "volunteer";
  const health = volunteerHealth(
    averageRating,
    deliveredSessions.length > 0 ? submittedReportCount / deliveredSessions.length : null
  );

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden rounded-[34px] p-0">
        <div className="bg-[linear-gradient(135deg,rgba(234,248,238,0.9),rgba(234,244,255,0.9))] p-6 md:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div className="flex min-w-0 items-center gap-5">
              <AmbassadorAvatar ambassador={ambassador} size="large" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
                  {isApplication ? "Ambassador application" : "Ambassador profile"}
                </p>
                <h2 className="mt-2 truncate text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-4xl">
                  {ambassador.name}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[color:var(--text-soft)]">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    {ambassador.regionName ?? titleCase(ambassador.regionSlug)}
                  </span>
                  <StatusBadge
                    value={
                      ambassador.status === "approved"
                        ? "confirmed"
                        : ambassador.status === "inactive"
                          ? "restricted"
                          : ambassador.status === "applied"
                            ? "tentative"
                            : "declined"
                    }
                    label={
                      ambassador.status === "approved"
                        ? "Active"
                        : ambassador.status === "inactive"
                          ? "Inactive"
                          : ambassador.status === "applied"
                            ? "Awaiting review"
                            : "Declined"
                    }
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {ambassador.email ? (
                <ButtonLink href={`mailto:${ambassador.email}`} variant="secondary">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Email
                </ButtonLink>
              ) : null}
              {ambassador.phone ? (
                <ButtonLink href={`tel:${ambassador.phone}`} variant="secondary">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Call
                </ButtonLink>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {!isApplication ? (
        <ProfileTabs
          ambassadorId={ambassador.id}
          basePath={basePath}
          activeSection={activeSection}
          counts={{
            presentations: deliveredSessions.length,
            reports: ambassadorReports.length,
            sourced: sourcedBookings.length,
            feedback: linkedSchoolReviews.length,
            payments: ambassadorPayments.length
          }}
        />
      ) : null}

      {!isApplication && activeSection === "overview" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            icon={CheckCircle2}
            label="Volunteer health"
            value={health.label}
            detail={health.detail}
          />
          <MetricCard
            icon={CalendarCheck}
            label="Presentations delivered"
            value={String(deliveredSessions.length)}
            detail={`${submittedReportCount}/${deliveredSessions.length} ambassador reports submitted`}
          />
          <MetricCard
            icon={Star}
            label="School feedback"
            value={averageRating === null ? "No rating" : `${averageRating.toFixed(1)}/5`}
            detail={performanceLabel(averageRating, linkedSchoolReviews.length)}
          />
          <MetricCard
            icon={Banknote}
            label="Total earnings"
            value={formatCurrency(totalEarningsCents)}
            detail={`${formatCurrency(ambassador.paidPaymentsCents)} paid to date`}
          />
          <MetricCard
            icon={FileText}
            label="Schools sourced"
            value={String(sourcedSchoolCount)}
            detail={`${formatCurrency(sourcingBonusCents)} in sourcing bonuses`}
          />
        </div>
      ) : null}

      {(isApplication || activeSection === "overview") ? (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-[34px]">
            <SectionTitle
              kicker={isApplication ? "Application details" : "Contact & profile"}
              title="Information on file"
            />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <InfoBlock label="Email" value={ambassador.email || "Not provided"} />
              <InfoBlock label="Phone" value={ambassador.phone ?? "Not provided"} />
              <InfoBlock
                label="Primary region"
                value={ambassador.regionName ?? titleCase(ambassador.regionSlug)}
              />
              <InfoBlock label="Travel" value={travelLabel(ambassador)} />
              <InfoBlock label="Referred by" value={ambassador.referredBy ?? "Not provided"} />
              <InfoBlock
                label="Portal account"
                value={ambassador.userId ? "Connected" : "Not connected yet"}
              />
              <InfoBlock
                label="Materials agreement"
                value={
                  ambassador.details?.materialsConsentAcceptedAt
                    ? `Signed ${formatDateTime(ambassador.details.materialsConsentAcceptedAt)}`
                    : "Not signed"
                }
              />
              {ambassador.details?.mailingAddress ? (
                <div className="sm:col-span-2">
                  <InfoBlock label="Mailing address" value={ambassador.details.mailingAddress} />
                </div>
              ) : null}
            </div>
            <div className="mt-4 rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                Presentation experience
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[color:var(--text-dark)]">
                {ambassador.experience ?? ambassador.bio ?? "No experience information was provided."}
              </p>
            </div>
          </Card>

          <Card className="rounded-[34px]">
            <SectionTitle
              kicker={isApplication ? "Staff decision" : "Account & record"}
              title={isApplication ? "Review this application" : "Manage volunteer"}
            />
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
              {isApplication
                ? ambassador.status === "declined"
                  ? "This application was declined. It can be reconsidered or deleted permanently."
                  : "Approve the application to add this person to the volunteer roster, or decline it to keep access closed."
                : ambassador.userId
                  ? "Change their roster status here. Making them inactive closes portal access without removing any presentation, feedback, sourcing, or payment history."
                  : "This volunteer is not connected to a portal account yet. Their roster status can still be changed without affecting their history."}
            </p>
            <div className="mt-6 grid gap-3">
              {isApplication ? (
                <>
                  <DecisionForm
                    action={reviewAction}
                    ambassadorId={ambassador.id}
                    status="approved"
                    returnTo={`${basePath}?tab=profiles`}
                    label={ambassador.status === "declined" ? "Reconsider and approve" : "Approve ambassador"}
                    pendingLabel="Approving ambassador..."
                  />
                  {ambassador.status === "applied" ? (
                    <DecisionForm
                      action={reviewAction}
                      ambassadorId={ambassador.id}
                      status="declined"
                      returnTo={`${basePath}?tab=applications`}
                      label="Decline application"
                      pendingLabel="Declining application..."
                      danger
                    />
                  ) : null}
                </>
              ) : ambassador.status === "approved" ? (
                <DecisionForm
                  action={reviewAction}
                  ambassadorId={ambassador.id}
                  status="inactive"
                  returnTo={`${basePath}/${ambassador.id}?section=overview`}
                  label="Mark volunteer inactive"
                  pendingLabel="Marking volunteer inactive..."
                  danger
                />
              ) : (
                <DecisionForm
                  action={reviewAction}
                  ambassadorId={ambassador.id}
                  status="approved"
                  returnTo={`${basePath}/${ambassador.id}?section=overview`}
                  label="Activate volunteer"
                  pendingLabel="Activating volunteer..."
                />
              )}
              {!isApplication && !ambassador.userId ? (
                <form
                  action={connectAction}
                  className="mt-2 rounded-[22px] border border-[color:var(--border-soft)] bg-[#f7fafc] p-4"
                >
                  <input type="hidden" name="ambassadorProfileId" value={ambassador.id} />
                  <input type="hidden" name="fullName" value={ambassador.name} />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={`${basePath}/${ambassador.id}?section=overview`}
                  />
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f3fa] text-[color:var(--navy)]">
                      <UserPlus className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--navy)]">
                        Connect to the ambassador portal
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[color:var(--text-soft)]">
                        An invite will create their login and attach it to this exact profile, keeping all existing history connected.
                      </p>
                    </div>
                  </div>
                  <label className="mt-4 block">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                      Portal email
                    </span>
                    <input
                      type="email"
                      name="email"
                      required
                      defaultValue={ambassador.email}
                      placeholder="ambassador@example.com"
                      autoComplete="email"
                      className="mt-2 w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)] outline-none transition focus:border-[color:rgba(24,168,59,0.34)] focus:ring-4 focus:ring-[rgba(24,168,59,0.1)]"
                    />
                  </label>
                  <PendingSubmitButton
                    type="submit"
                    pendingLabel="Sending portal invite..."
                    className="mt-3 min-h-[48px] w-full rounded-[18px]"
                  >
                    Invite and connect profile
                  </PendingSubmitButton>
                </form>
              ) : null}
              <AmbassadorDeleteDialog
                ambassadorId={ambassador.id}
                ambassadorName={ambassador.name}
                recordType={recordType}
                returnTo={`${basePath}?tab=${isApplication ? "applications" : "profiles"}`}
                action={deleteAction}
              />
            </div>
          </Card>
        </div>
      ) : null}

      {!isApplication && activeSection === "presentations" ? (
        <DataTable
          title="Presentation history"
          columns={["Date", "School", "Presentation", "Ambassador report", "School feedback"]}
          emptyMessage="No completed presentations are assigned to this volunteer yet."
          rows={deliveredSessions.map((session) => {
            const report = reportsBySessionId.get(session.id);
            const reportSubmitted =
              Boolean(report) ||
              ["submitted", "reviewed"].includes(session.reportStatus);
            const review = reviewsBySessionId.get(session.id);

            return [
              formatDateTime(session.startsAt),
              session.schoolName,
              session.presentationTitle,
              report ? (
                <ReportDetailsButton
                  key={`${session.id}-report`}
                  report={report}
                  reports={ambassadorReports}
                  label="View report"
                />
              ) : (
                <StatusBadge
                  key={`${session.id}-report`}
                  value={reportSubmitted ? "submitted" : "not_submitted"}
                  label={reportSubmitted ? "Submitted" : "Missing"}
                />
              ),
              review
                ? <div key={`${session.id}-feedback`} className="flex items-center gap-2">
                    {typeof review.rating === "number" ? <span className="text-sm font-semibold text-[color:var(--navy)]">{review.rating.toFixed(1)}/5</span> : null}
                    <SchoolFeedbackDetailsButton review={review} />
                  </div>
                : "Not received"
            ];
          })}
        />
      ) : null}

      {!isApplication && activeSection === "reports" ? (
        <Card className="rounded-[34px]">
          <SectionTitle kicker="Ambassador submissions" title="Reports and linked school feedback" />
          <p className="mt-2 text-sm text-[color:var(--text-soft)]">
            Every submitted report stays connected to its presentation and any feedback received from the school.
          </p>
          {ambassadorReports.length === 0 ? (
            <EmptyMessage icon={FileText}>No ambassador reports have been submitted yet.</EmptyMessage>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {ambassadorReports.map((report) => {
                const session = report.bookingSessionId ? sessionsById.get(report.bookingSessionId) : undefined;
                const review = report.bookingSessionId ? reviewsBySessionId.get(report.bookingSessionId) : undefined;
                const reportNote = report.presentationFeedback ?? report.additionalNotes;

                return (
                  <article key={report.id} className="flex h-full flex-col rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-[color:var(--navy)]">{report.schoolName}</p>
                        <p className="mt-1 text-xs text-[color:var(--text-soft)]">{report.presentationTitle} · submitted {formatDateTime(report.submittedAt)}</p>
                      </div>
                      <StatusBadge value={report.status} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <InfoBlock label="Students reached" value={String(report.attendeeCount)} />
                      <InfoBlock label="Presentation date" value={session ? formatDateTime(session.startsAt) : report.deliveredAt ? formatDateTime(report.deliveredAt) : "Not linked"} />
                    </div>
                    <div className="mt-4 flex-1 rounded-[17px] bg-[#f7f9fc] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[color:var(--text-soft)]">Ambassador feedback</p>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[color:var(--text-dark)]">{reportNote || "No written feedback was added to this report."}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <ReportDetailsButton report={report} reports={ambassadorReports} label="View full report" />
                      {review ? <SchoolFeedbackDetailsButton review={review} label="View school feedback" /> : <span className="text-xs text-[color:var(--text-soft)]">No school feedback yet</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      {!isApplication && activeSection === "sourced" ? (
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard icon={FileText} label="Schools sourced" value={String(sourcedSchoolCount)} detail="Unique schools attributed to this volunteer" />
            <MetricCard icon={CalendarCheck} label="Bookings created" value={String(sourcedBookings.length)} detail="Bookings with this volunteer recorded as the source" />
            <MetricCard icon={Banknote} label="Sourcing bonuses" value={formatCurrency(sourcingBonusCents)} detail="$50 tracked separately for each eligible sourced delivery" />
          </div>
          <DataTable
            title="Sourced schools and bookings"
            columns={["Created", "School", "Presentation", "Sessions", "Booking status", "Tracked bonus"]}
            emptyMessage="No schools or bookings are attributed to this volunteer yet."
            rows={sourcedBookings.map((booking) => {
              const bookingSessionIds = new Set(booking.sessions.map((session) => session.id));
              const bonus = ambassadorPayments
                .filter((payment) => bookingSessionIds.has(payment.bookingSessionId))
                .reduce((total, payment) => total + payment.sourcingBonusCents, 0);
              return [
                formatDateTime(booking.createdAt),
                booking.schoolName,
                booking.sessions[0]?.presentationTitle ?? "Presentation pending",
                String(booking.sessions.length),
                <StatusBadge key={`${booking.id}-status`} value={booking.status} />,
                bonus > 0 ? formatCurrency(bonus) : "Pending eligibility"
              ];
            })}
          />
        </div>
      ) : null}

      {!isApplication && activeSection === "feedback" ? (
        <Card className="rounded-[34px]">
          <SectionTitle kicker="Quality tracking" title="School feedback" />
          <p className="mt-2 text-sm text-[color:var(--text-soft)]">
            {performanceLabel(averageRating, linkedSchoolReviews.length)}
          </p>
          {linkedSchoolReviews.length === 0 ? (
            <EmptyMessage icon={Star}>
              No linked school feedback yet. Feedback appears here only when it belongs to a
              booking session assigned to this volunteer.
            </EmptyMessage>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {linkedSchoolReviews.map(({ session, review }) => (
                <article key={review.id} className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--navy)]">{review.schoolName}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        {session.presentationTitle} · {formatDateTime(session.startsAt)}
                      </p>
                    </div>
                    {typeof review.rating === "number" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7df] px-3 py-1.5 text-sm font-semibold text-[#7a5500]">
                        <Star className="h-4 w-4 fill-[#f5bd42] text-[#f5bd42]" aria-hidden="true" />
                        {review.rating.toFixed(1)}/5
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[color:var(--text-dark)]">“{review.quote}”</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <SchoolFeedbackDetailsButton review={review} label="View school feedback" />
                    {reportsBySessionId.get(session.id) ? (
                      <ReportDetailsButton report={reportsBySessionId.get(session.id)!} reports={ambassadorReports} label="View ambassador report" />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {!isApplication && activeSection === "payments" ? (
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard icon={CheckCircle2} label="Paid to date" value={formatCurrency(ambassador.paidPaymentsCents)} detail="Payments marked paid" />
            <MetricCard icon={FileText} label="Outstanding" value={formatCurrency(outstandingCents)} detail={`${outstandingPayments.length} outstanding ${outstandingPayments.length === 1 ? "payment" : "payments"}`} />
            <MetricCard icon={Banknote} label="Sourcing bonuses" value={formatCurrency(sourcingBonusCents)} detail="Additional $50 bonuses tracked separately" />
          </div>
          <DataTable
            title="Payments and invoices"
            columns={["School", "Delivery fee", "Sourcing bonus", "Total", "Invoice", "Status"]}
            emptyMessage="No payment records exist for this volunteer yet."
            rows={ambassadorPayments.map((payment) => {
              const session = sessionsById.get(payment.bookingSessionId);
              return [
                session?.schoolName ?? "Presentation payment",
                formatCurrency(payment.baseAmountCents),
                payment.sourcingBonusCents > 0 ? formatCurrency(payment.sourcingBonusCents) : "—",
                formatCurrency(payment.amountCents),
                payment.invoiceNumber ?? "Not submitted",
                <StatusBadge key={`${payment.id}-status`} value={payment.status} />
              ];
            })}
          />
        </div>
      ) : null}
    </div>
  );
}

function VolunteerDirectoryControls({
  basePath,
  activeStatus,
  query,
  sort,
  activeCount,
  inactiveCount
}: {
  basePath: string;
  activeStatus: VolunteerDirectoryStatus;
  query: string;
  sort: VolunteerDirectorySort;
  activeCount: number;
  inactiveCount: number;
}) {
  const tabs: Array<{
    value: VolunteerDirectoryStatus;
    label: string;
    count: number;
    icon: LucideIcon;
  }> = [
    { value: "active", label: "Active ambassadors", count: activeCount, icon: UserRoundCheck },
    { value: "inactive", label: "Inactive ambassadors", count: inactiveCount, icon: UserRoundX }
  ];
  const hrefForStatus = (status: VolunteerDirectoryStatus) => {
    const params = new URLSearchParams({ tab: "profiles", roster: status });
    if (query.trim()) {
      params.set("q", query.trim());
    }
    params.set("sort", sort);
    return `${basePath}?${params.toString()}`;
  };
  const hrefForSort = (nextSort: VolunteerDirectorySort) => {
    const params = new URLSearchParams({
      tab: "profiles",
      roster: activeStatus,
      sort: nextSort
    });
    if (query.trim()) {
      params.set("q", query.trim());
    }
    return `${basePath}?${params.toString()}`;
  };

  return (
    <div className="grid gap-4">
      <nav
        aria-label="Volunteer directory status"
        className="flex gap-7 overflow-x-auto border-b border-[color:rgba(4,15,75,0.08)]"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.value === activeStatus;
          return (
            <Link
              key={tab.value}
              href={hrefForStatus(tab.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-[48px] shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition",
                active
                  ? "border-[color:var(--green)] text-[color:var(--navy)]"
                  : "border-transparent text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-[color:var(--green)]")} aria-hidden="true" />
              {tab.label}
              <span
                className={cn(
                  "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px]",
                  active
                    ? "bg-[color:var(--green-soft)] text-[#117a2e]"
                    : "bg-[#eef2f8] text-[color:var(--text-soft)]"
                )}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </nav>

      <form action={basePath} method="get" className="flex flex-wrap gap-3">
        <input type="hidden" name="tab" value="profiles" />
        <input type="hidden" name="roster" value={activeStatus} />
        <input type="hidden" name="sort" value={sort} />
        <label className="flex min-h-[48px] min-w-[260px] flex-1 items-center gap-2.5 rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" aria-hidden="true" />
          <span className="sr-only">Search ambassadors</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name, email, phone, or region..."
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
          />
        </label>
        <PendingSubmitButton unstyled
          type="submit"
          className="inline-flex min-h-[48px] items-center justify-center rounded-[16px] border border-[#a2cae3] bg-[#afd5ed] px-5 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[#c0dff2]"
        >
          Search
        </PendingSubmitButton>
        {query.trim() ? (
          <ButtonLink
            href={`${basePath}?tab=profiles&roster=${activeStatus}&sort=${sort}`}
            variant="ghost"
            className="min-h-[48px]"
          >
            Clear
          </ButtonLink>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-2" aria-label="Sort volunteers by name">
        <span className="mr-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
          <ListOrdered className="h-4 w-4" aria-hidden="true" />
          Sort by name
        </span>
        {([
          ["asc", "A–Z"],
          ["desc", "Z–A"]
        ] as const).map(([value, label]) => {
          const active = value === sort;
          return (
            <Link
              key={value}
              href={hrefForSort(value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-[38px] items-center justify-center rounded-[13px] border px-3 text-sm font-semibold transition",
                active
                  ? "border-[color:var(--navy)] bg-[color:var(--navy)] text-white"
                  : "border-[color:var(--border-soft)] bg-white text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ProfileTabs({
  ambassadorId,
  basePath,
  activeSection,
  counts
}: {
  ambassadorId: string;
  basePath: string;
  activeSection: AmbassadorProfileSection;
  counts: Record<Exclude<AmbassadorProfileSection, "overview">, number>;
}) {
  const tabs: Array<{ value: AmbassadorProfileSection; label: string; count?: number }> = [
    { value: "overview", label: "Overview" },
    { value: "presentations", label: "Presentations", count: counts.presentations },
    { value: "reports", label: "Reports", count: counts.reports },
    { value: "sourced", label: "Sourced schools", count: counts.sourced },
    { value: "feedback", label: "School feedback", count: counts.feedback },
    { value: "payments", label: "Payments", count: counts.payments }
  ];

  return (
    <nav
      aria-label="Volunteer profile sections"
      className="flex w-full gap-2 overflow-x-auto rounded-[22px] border border-[color:var(--border-soft)] bg-white/80 p-2 shadow-[0_12px_30px_rgba(11,24,77,0.06)]"
    >
      {tabs.map((tab) => {
        const active = tab.value === activeSection;
        return (
          <Link
            key={tab.value}
            href={`${basePath}/${ambassadorId}?section=${tab.value}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-[16px] px-4 py-2 text-sm font-semibold transition",
              active
                ? "bg-[color:var(--navy)] text-white shadow-[0_10px_22px_rgba(4,15,75,0.16)]"
                : "text-[color:var(--text-soft)] hover:bg-white hover:text-[color:var(--navy)]"
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className={cn("rounded-full px-2 py-0.5 text-xs", active ? "bg-white/16" : "bg-[#edf1f5] text-[color:var(--navy)]")}>
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function AmbassadorTabs({
  basePath,
  activeTab,
  profileCount,
  applicationCount
}: {
  basePath: string;
  activeTab: AmbassadorTab;
  profileCount: number;
  applicationCount: number;
}) {
  const tabs = [
    { value: "profiles" as const, label: "Volunteer directory", count: profileCount },
    { value: "applications" as const, label: "Ambassador applications", count: applicationCount }
  ];

  return (
    <nav
      aria-label="Ambassador sections"
      className="flex w-full flex-wrap gap-2 rounded-[22px] border border-[color:var(--border-soft)] bg-white/80 p-2 shadow-[0_12px_30px_rgba(11,24,77,0.06)]"
    >
      {tabs.map((tab) => {
        const active = tab.value === activeTab;
        return (
          <Link
            key={tab.value}
            href={`${basePath}?tab=${tab.value}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-[16px] px-4 py-2 text-sm font-semibold transition sm:flex-none",
              active
                ? "bg-[color:var(--navy)] text-white shadow-[0_10px_22px_rgba(4,15,75,0.16)]"
                : "text-[color:var(--text-soft)] hover:bg-white hover:text-[color:var(--navy)]"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs",
                active ? "bg-white/16 text-white" : "bg-[#edf1f5] text-[color:var(--navy)]"
              )}
            >
              {tab.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function AmbassadorIdentity({ ambassador }: { ambassador: AmbassadorProfile }) {
  return (
    <div className="flex min-w-[180px] items-center gap-3">
      <AmbassadorAvatar ambassador={ambassador} size="small" />
      <div className="min-w-0">
        <p className="truncate font-semibold text-[color:var(--navy)]">{ambassador.name}</p>
        <p className="mt-0.5 truncate text-xs font-normal text-[color:var(--text-soft)]">
          {ambassador.email}
        </p>
      </div>
    </div>
  );
}

function AmbassadorAvatar({
  ambassador,
  size
}: {
  ambassador: AmbassadorProfile;
  size: "small" | "large";
}) {
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-full bg-[linear-gradient(135deg,#cfeaf8,#dff3e5)] text-[color:var(--navy)] shadow-[inset_0_0_0_1px_rgba(4,15,75,0.08)]",
        size === "large" ? "h-24 w-24" : "h-11 w-11"
      )}
    >
      {ambassador.imageUrl ? (
        // Profile images come from the configured Supabase public bucket, which can vary by deployment.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ambassador.imageUrl}
          alt={`${ambassador.name} profile`}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center font-semibold",
            size === "large" ? "text-2xl" : "text-sm"
          )}
          aria-label={`${ambassador.name} initials`}
        >
          {initials(ambassador.name) || "A"}
        </span>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-[28px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--text-soft)]">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
            {value}
          </p>
        </div>
        <span className="rounded-[16px] bg-[#eef7fc] p-3 text-[#2a5f84]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[color:var(--text-soft)]">{detail}</p>
    </Card>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
        {kicker}
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {title}
      </h3>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="h-full rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
        {label}
      </p>
      <p className="mt-2 break-words text-sm leading-6 text-[color:var(--navy)]">{value}</p>
    </div>
  );
}

function DecisionForm({
  action,
  ambassadorId,
  status,
  returnTo,
  label,
  pendingLabel,
  danger = false
}: {
  action: (formData: FormData) => void | Promise<void>;
  ambassadorId: string;
  status: "approved" | "declined" | "inactive";
  returnTo: string;
  label: string;
  pendingLabel: string;
  danger?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="ambassadorProfileId" value={ambassadorId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <PendingSubmitButton
        type="submit"
        pendingLabel={pendingLabel}
        variant={danger ? "danger" : "primary"}
        className="min-h-[48px] w-full rounded-[18px]"
      >
        {label}
      </PendingSubmitButton>
    </form>
  );
}

function EmptyMessage({
  icon: Icon,
  children
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="mt-5 flex gap-3 rounded-[20px] bg-[#f6f8fb] p-4 text-sm leading-6 text-[color:var(--text-soft)]">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

type VolunteerHealth = {
  label: "Healthy" | "Monitor" | "Needs attention" | "No data";
  detail: string;
};

function volunteerHealth(
  schoolRating: number | null,
  reportCompletion: number | null
): VolunteerHealth {
  if (schoolRating === null && reportCompletion === null) {
    return { label: "No data", detail: "Complete sessions will establish a health signal" };
  }

  if (
    (schoolRating !== null && schoolRating < 3.5) ||
    (reportCompletion !== null && reportCompletion < 0.75)
  ) {
    return {
      label: "Needs attention",
      detail: "Low feedback or missing ambassador reports requires follow-up"
    };
  }

  if (
    (schoolRating !== null && schoolRating < 4) ||
    (reportCompletion !== null && reportCompletion < 1)
  ) {
    return { label: "Monitor", detail: "Performance is acceptable but needs monitoring" };
  }

  return { label: "Healthy", detail: "Strong school feedback and report completion" };
}

function HealthBadge({ health }: { health: VolunteerHealth }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1.5 text-xs font-semibold",
        health.label === "Healthy"
          ? "bg-[#eaf8ee] text-[#117a2e]"
          : health.label === "Monitor"
            ? "bg-[#fff3e2] text-[#a85a00]"
            : health.label === "Needs attention"
              ? "bg-[#ffecec] text-[#b42318]"
              : "bg-[#f1f3f6] text-[#667085]"
      )}
    >
      {health.label}
    </span>
  );
}

function travelLabel(ambassador: AmbassadorProfile) {
  if (!ambassador.openToTravel) {
    return "Local region only";
  }

  return ambassador.travelRegions.length > 0
    ? ambassador.travelRegions.map(titleCase).join(", ")
    : "Open to travel";
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function performanceLabel(rating: number | null, reviewCount: number) {
  if (rating === null) {
    return "No linked school feedback yet";
  }

  const label = rating >= 4.5 ? "Excellent" : rating >= 4 ? "Strong" : rating >= 3 ? "Developing" : "Needs attention";
  return `${label} · ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`;
}
