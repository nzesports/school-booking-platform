import {
  BookOpenCheck,
  CalendarCheck2,
  CheckCircle2,
  Coins,
  FileSpreadsheet,
  GraduationCap,
  UserRound,
  Wallet
} from "lucide-react";

import { logoutAction } from "@/app/auth/actions";
import {
  applyToSessionAction,
  markTrainingCompleteAction,
  saveAmbassadorProfileAction,
  submitAmbassadorReportAction,
  submitPaymentInvoiceAction
} from "@/app/portal/actions";
import { AmbassadorProfileWorkspace } from "@/components/dashboard/ambassador-profile";
import { AmbassadorReportForm } from "@/components/dashboard/ambassador-report-form";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { ReportDetailsButton } from "@/components/dashboard/report-details-dialog";
import { SessionDetailsButton } from "@/components/dashboard/session-details-dialog";
import { TrainingWorkspace } from "@/components/dashboard/training-workspace";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DashboardMetric } from "@/lib/domain/types";
import { requirePortalAccess } from "@/lib/services/auth";
import { getAmbassadorPortalData } from "@/lib/services/portal";
import {
  formatCurrency,
  formatShortDate,
  formatTime,
  formatWeekdayDate
} from "@/lib/utils";

const navItems = [
  { href: "/ambassador", label: "Overview", icon: UserRound },
  { href: "/ambassador/open-bookings", label: "Open bookings", icon: BookOpenCheck },
  { href: "/ambassador/upcoming", label: "Upcoming", icon: CalendarCheck2 },
  { href: "/ambassador/completed", label: "Completed", icon: FileSpreadsheet },
  { href: "/ambassador/earnings", label: "Earnings", icon: Coins },
  { href: "/ambassador/training", label: "Training", icon: GraduationCap },
  { href: "/ambassador/profile", label: "Profile", icon: Wallet }
];

export default async function AmbassadorPortalPage({
  params,
  searchParams
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const route = slug?.join("/") ?? "";
  const actor = await requirePortalAccess("ambassador");
  const portal = await getAmbassadorPortalData(actor.id);
  const ownedSessions = portal.assignedSessions;
  const now = new Date();
  const upcomingSessions = ownedSessions.filter(
    (session) => new Date(session.startsAt).getTime() > now.getTime() && session.status !== "cancelled"
  );
  const completedSessions = ownedSessions.filter(
    (session) => new Date(session.endsAt).getTime() <= now.getTime() && session.status !== "cancelled"
  );
  const ambassadorPayments = portal.payments;
  const sessionsById = new Map(ownedSessions.map((session) => [session.id, session]));
  const paymentSessionLabel = (bookingSessionId: string) => {
    const session = sessionsById.get(bookingSessionId);
    return session ? `${session.presentationTitle} · ${session.schoolName}` : bookingSessionId;
  };
  const selectedInvoicePayment = route.startsWith("earnings/invoice/")
    ? ambassadorPayments.find((payment) => payment.id === slug?.[2]) ?? null
    : null;
  const selectedReportSessionId = route.startsWith("report/")
    ? slug?.[1]
    : route.startsWith("reports/")
      ? slug?.[1]
      : null;
  const trainingProgress =
    portal.trainingModules.length > 0
      ? Math.round(
          portal.trainingModules.reduce((total, module) => total + module.progress, 0) /
            portal.trainingModules.length
        )
      : 0;
  const notice = getAmbassadorNotice(resolvedSearchParams);
  const reportRatings = portal.reports.flatMap((report) =>
    [report.teacherResponseRating, report.studentEngagementRating].filter(
      (rating): rating is number => typeof rating === "number" && rating > 0
    )
  );
  const profileStats = {
    schoolVisits: completedSessions.length,
    nextPayoutCents: portal.ambassador.pendingPaymentsCents,
    ratingAverage:
      reportRatings.length > 0
        ? reportRatings.reduce((total, rating) => total + rating, 0) / reportRatings.length
        : null,
    ratingCount: portal.reports.length
  };

  const metrics: DashboardMetric[] = [
    {
      label: "Estimated earnings",
      value: formatCurrency(portal.ambassador.estimatedEarningsCents),
      trend: "All time",
      detail: "Across assigned and eligible sessions",
      icon: "banknote",
      tone: "green"
    },
    {
      label: "Pending payments",
      value: formatCurrency(portal.ambassador.pendingPaymentsCents),
      trend: "Awaiting finance",
      detail: "Current payment queue",
      icon: "banknote",
      tone: "amber"
    },
    {
      label: "Upcoming sessions",
      value: String(upcomingSessions.length),
      trend: "Assigned to you",
      detail: "Confirmed and report-ready",
      icon: "calendar",
      tone: "blue"
    },
    {
      label: "Training progress",
      value: `${trainingProgress}%`,
      trend: "Across current modules",
      detail: "Presenter induction plus session packs",
      icon: "sparkles",
      tone: "navy"
    }
  ];

  const headline =
    route === ""
      ? `Kia ora, ${actor.fullName.split(" ")[0]}`
      : route.startsWith("open-bookings")
        ? "Review privacy-safe open opportunities"
        : route.startsWith("reports")
          ? "Submit post-session reports"
          : route.startsWith("earnings/invoice/")
            ? "Submit your invoice for payment"
            : route === "earnings"
              ? "Track earnings and payment status"
              : route === "profile"
                ? "Manage your profile and payment details"
                : route === "training" || route.startsWith("training/")
                  ? "Complete training and access resources"
                  : route === "upcoming"
                    ? "Your upcoming presentation schedule"
                    : "Ambassador workspace";

  const subheadline =
    route === ""
      ? "Here’s what’s happening across your upcoming presentations, applications, and reporting work."
      : route === "training" || route === "resources" || route.startsWith("training/")
        ? "Build your confidence and access everything you need to deliver great sessions."
        : "Everything here is scoped to the ambassador experience, with privacy-safe access before assignment and operational tools after confirmation.";

  return (
    <main className="pb-12">
      <DashboardShell
        title="Ambassador Portal"
        role="ambassador"
        navItems={navItems}
        currentPath={`/ambassador${route ? `/${route}` : ""}`}
        headline={headline}
        subheadline={subheadline}
        dateLabel="This month"
        logoutAction={logoutAction}
        profile={{
          name: actor.fullName,
          subtitle: "NZ Esports Ambassador"
        }}
      >
        {notice ? (
          <Card
            className={
              notice.tone === "error"
                ? "rounded-[24px] border-[#f2c6c6] bg-[#fff6f6] px-5 py-4 text-sm font-semibold text-[#9d2424]"
                : "rounded-[24px] border-[#b9e2c7] bg-[#f4fbf6] px-5 py-4 text-sm font-semibold text-[#1d6f35]"
            }
          >
            {notice.message}
          </Card>
        ) : null}

        {route === "" ? (
          <>
            <MetricGrid metrics={metrics} />

            <div className="grid gap-5 xl:grid-cols-[1.04fr_0.96fr]">
              <Card className="rounded-[34px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                      Open opportunities
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                      Available bookings you can apply for
                    </h2>
                  </div>
                  <ButtonLink href="/ambassador/open-bookings" variant="ghost">
                    View all
                  </ButtonLink>
                </div>

                <div className="mt-6 grid gap-4">
                  {portal.openSessions.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-[color:var(--navy)]">
                            {session.presentationTitle}
                          </p>
                          <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                            {formatWeekdayDate(session.startsAt)} · {formatTime(session.startsAt)} ·{" "}
                            {session.yearLevels}
                          </p>
                          <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                            {session.expectedStudentCount} students · {session.regionSlug}
                          </p>
                        </div>
                        <StatusBadge value={session.status} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <ButtonLink
                          href={`/ambassador/open-bookings/${session.id}`}
                          variant="secondary"
                        >
                          View safe details
                        </ButtonLink>
                        {session.myApplicationStatus ? (
                          <span className="inline-flex min-h-[48px] items-center gap-2 rounded-[18px] border border-[rgba(24,168,59,0.28)] bg-[color:var(--green-soft)] px-5 py-2.5 text-sm font-semibold text-[#1d6f35]">
                            <CheckCircle2 className="h-4 w-4" />
                            Applied — in review
                          </span>
                        ) : (
                          <form action={applyToSessionAction}>
                            <input type="hidden" name="bookingSessionId" value={session.id} />
                            <input type="hidden" name="returnTo" value="/ambassador/open-bookings" />
                            <button
                              type="submit"
                              className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)]"
                            >
                              Apply
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[34px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                      Upcoming bookings
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                      Your confirmed schedule
                    </h2>
                  </div>
                  <ButtonLink href="/ambassador/upcoming" variant="ghost">
                    View all
                  </ButtonLink>
                </div>

                <div className="mt-6 grid gap-4">
                  {upcomingSessions.length === 0 ? (
                    <p className="text-sm leading-7 text-[color:var(--text-soft)]">
                      No confirmed sessions yet. Apply for an open opportunity and it will appear
                      here once staff assign you.
                    </p>
                  ) : null}
                  {upcomingSessions.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-[24px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)] p-5 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-[color:var(--text-soft)]">
                            {formatShortDate(session.startsAt)} · {formatTime(session.startsAt)}
                          </p>
                          <p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                            {session.presentationTitle}
                          </p>
                          <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                            {session.schoolName}
                          </p>
                        </div>
                        <StatusBadge value={session.status} />
                      </div>
                      <div className="mt-3">
                        <SessionDetailsButton session={session} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_1fr_0.9fr]">
              <Card className="rounded-[34px]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Training progress
                </p>
                <div className="mt-5 grid gap-4">
                  {portal.trainingModules.length === 0 ? (
                    <p className="text-sm leading-7 text-[color:var(--text-soft)]">
                      No training modules have been published yet. They&apos;ll appear here as soon
                      as the team adds them.
                    </p>
                  ) : null}
                  {portal.trainingModules.map((module) => (
                    <div key={module.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[color:var(--navy)]">{module.title}</p>
                          <p className="text-sm text-[color:var(--text-soft)]">
                            {module.description}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-[color:var(--green)]">
                          {module.progress}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-[color:var(--blue-soft)]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(135deg,var(--green),var(--green-bright))]"
                          style={{ width: `${module.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[34px]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Recent reports
                </p>
                <div className="mt-5 grid gap-4">
                  {portal.reports.length === 0 ? (
                    <p className="text-sm leading-7 text-[color:var(--text-soft)]">
                      Reports you submit after each session will appear here.
                    </p>
                  ) : null}
                  {portal.reports.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[color:var(--navy)]">{report.schoolName}</p>
                          <p className="text-sm text-[color:var(--text-soft)]">
                            {report.presentationTitle}
                          </p>
                        </div>
                        <StatusBadge value={report.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-[color:var(--text-soft)]">
                          {report.attendeeCount} attendees · {formatShortDate(report.submittedAt)}
                        </p>
                        <ReportDetailsButton report={report} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[34px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                    Resource library
                  </p>
                  <ButtonLink href="/ambassador/training" variant="ghost" className="min-h-[36px] px-3 py-1.5 text-xs">
                    View all
                  </ButtonLink>
                </div>
                <div className="mt-5 grid gap-4">
                  {portal.resources.length === 0 ? (
                    <p className="text-sm leading-7 text-[color:var(--text-soft)]">
                      Presentation decks, delivery checklists, and guides will appear here once the
                      team publishes them.
                    </p>
                  ) : null}
                  {portal.resources.slice(0, 3).map((resource) => (
                    <div
                      key={resource.id}
                      className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4"
                    >
                      <p className="font-semibold text-[color:var(--navy)]">{resource.title}</p>
                      <p className="mt-1 text-sm leading-7 text-[color:var(--text-soft)]">
                        {resource.description}
                      </p>
                      {resource.downloadUrl ? (
                        <ButtonLink
                          href={resource.downloadUrl}
                          variant="secondary"
                          className="mt-3 min-h-[38px] rounded-[14px] px-3.5 py-1.5 text-xs"
                        >
                          Open resource
                        </ButtonLink>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        ) : null}

        {route === "open-bookings" ? (
          <DataTable
            title="Open booking opportunities"
            columns={["Presentation", "Schedule", "Region", "Status", "Action"]}
            rows={portal.openSessions.map((session) => [
              session.presentationTitle,
              `${formatWeekdayDate(session.startsAt)} · ${formatTime(session.startsAt)}`,
              session.regionName ?? session.regionSlug,
              <StatusBadge key={`${session.id}-status`} value={session.status} />,
              session.myApplicationStatus ? (
                <span
                  key={`${session.id}-applied`}
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(24,168,59,0.28)] bg-[color:var(--green-soft)] px-3 py-1.5 text-xs font-semibold text-[#1d6f35]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Applied — in review
                </span>
              ) : (
                <form key={`${session.id}-apply`} action={applyToSessionAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="bookingSessionId" value={session.id} />
                  <input type="hidden" name="returnTo" value="/ambassador/open-bookings" />
                  <Button type="submit" variant="secondary">
                    Apply
                  </Button>
                </form>
              )
            ])}
          />
        ) : null}

        {route.startsWith("open-bookings/") ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Apply for this session
            </h2>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
              The staff team will review applications and decide assignment. Teacher contact
              details stay hidden at this stage.
            </p>
            {portal.openSessions.find((session) => session.id === slug?.[1])
              ?.myApplicationStatus ? (
              <p className="mt-6 inline-flex items-center gap-2 rounded-[18px] border border-[rgba(24,168,59,0.28)] bg-[color:var(--green-soft)] px-5 py-3 text-sm font-semibold text-[#1d6f35]">
                <CheckCircle2 className="h-4 w-4" />
                You&apos;ve applied for this session — staff are reviewing applications now.
              </p>
            ) : (
              <form action={applyToSessionAction} className="mt-6 grid gap-4">
                <input type="hidden" name="bookingSessionId" value={slug?.[1] ?? ""} />
                <input type="hidden" name="returnTo" value="/ambassador/open-bookings" />
                <Textarea
                  name="message"
                  placeholder="Share why you're a strong fit for this presentation."
                  required
                />
                <Button type="submit">Submit application</Button>
              </form>
            )}
          </Card>
        ) : null}

        {route === "upcoming" || route === "completed" ? (
          <DataTable
            title={route === "upcoming" ? "Assigned upcoming sessions" : "Completed sessions"}
            columns={[
              "Presentation",
              "School",
              "Time",
              "Status",
              route === "upcoming" ? "Details" : "Report"
            ]}
            rows={(route === "upcoming" ? upcomingSessions : completedSessions).map((session) => [
              session.presentationTitle,
              session.schoolName,
              `${formatWeekdayDate(session.startsAt)} · ${formatTime(session.startsAt)}`,
              <StatusBadge key={`${session.id}-session`} value={session.status} />,
              route === "completed" && session.reportStatus === "not_submitted" ? (
                <ButtonLink
                  key={`${session.id}-report`}
                  href={`/ambassador/report/${session.id}`}
                  variant="secondary"
                >
                  Submit report
                </ButtonLink>
              ) : route === "completed" ? (
                <StatusBadge key={`${session.id}-report-status`} value={session.reportStatus} />
              ) : (
                <SessionDetailsButton key={`${session.id}-details`} session={session} />
              )
            ])}
          />
        ) : null}

        {selectedReportSessionId ? (
          <AmbassadorReportForm
            sessionId={selectedReportSessionId}
            session={ownedSessions.find((session) => session.id === selectedReportSessionId) ?? null}
            presenterName={actor.fullName}
            action={submitAmbassadorReportAction}
          />
        ) : null}

        {route === "earnings" ? (
          <DataTable
            title="Earnings and payment status"
            columns={["Session", "Amount", "Status", "Invoice"]}
            rows={ambassadorPayments.map((record) => [
              paymentSessionLabel(record.bookingSessionId),
              formatCurrency(record.amountCents),
              <StatusBadge key={`${record.id}-status`} value={record.status} />,
              record.status === "pending" ? (
                <ButtonLink
                  key={`${record.id}-invoice`}
                  href={`/ambassador/earnings/invoice/${record.id}`}
                  variant="secondary"
                  className="min-h-[40px] rounded-[14px] px-3 py-1.5"
                >
                  Submit invoice
                </ButtonLink>
              ) : record.invoiceNumber ? (
                <ButtonLink
                  key={`${record.id}-invoice`}
                  href={`/portal/invoice/${record.id}`}
                  variant="ghost"
                  className="min-h-[40px] rounded-[14px] px-3 py-1.5"
                >
                  {record.invoiceNumber}
                </ButtonLink>
              ) : (
                record.eligibilityReason
              )
            ])}
          />
        ) : null}

        {route.startsWith("earnings/invoice/") ? (
          selectedInvoicePayment && selectedInvoicePayment.status === "pending" ? (
            <Card className="rounded-[34px]">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                Submit invoice for this session
              </h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                We generate the invoice PDF for you from these details. The staff team receives it,
                sends it to finance, and you&apos;ll be notified once it has been submitted for
                payment.
              </p>
              <div className="mt-6 rounded-[24px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-5 py-4">
                <p className="text-sm font-semibold text-[color:var(--navy)]">
                  {paymentSessionLabel(selectedInvoicePayment.bookingSessionId)}
                </p>
                <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                  Amount payable: {formatCurrency(selectedInvoicePayment.amountCents)} ·{" "}
                  {selectedInvoicePayment.eligibilityReason}
                </p>
              </div>
              <form action={submitPaymentInvoiceAction} className="mt-6 grid gap-4">
                <input type="hidden" name="paymentId" value={selectedInvoicePayment.id} />
                <input type="hidden" name="returnTo" value="/ambassador/earnings" />
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-[color:var(--navy)]">
                    Bank account number *
                    <Input
                      name="bankAccountNumber"
                      required
                      defaultValue={portal.ambassador.bankAccountNumber ?? ""}
                      placeholder="12-3456-7890123-00"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-[color:var(--navy)]">
                    GST number (optional)
                    <Input
                      name="gstNumber"
                      defaultValue={portal.ambassador.gstNumber ?? ""}
                      placeholder="123-456-789"
                    />
                  </label>
                </div>
                <Textarea
                  name="invoiceNotes"
                  placeholder="Notes for the team or finance (optional)"
                />
                <label className="flex items-center gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-3 text-sm text-[color:var(--navy)]">
                  <input type="checkbox" name="saveToProfile" defaultChecked />
                  Save these payment details to my profile for next time.
                </label>
                <Button type="submit">Submit invoice</Button>
              </form>
            </Card>
          ) : (
            <Card className="rounded-[34px]">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                This payment can&apos;t be invoiced
              </h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                {selectedInvoicePayment
                  ? "An invoice has already been submitted for this session payment, or it isn't ready for invoicing yet."
                  : "We couldn't find that payment on your account."}
              </p>
              <ButtonLink href="/ambassador/earnings" variant="secondary" className="mt-5">
                Back to earnings
              </ButtonLink>
            </Card>
          )
        ) : null}

        {route === "resources" || route === "training" || route.startsWith("training/") ? (
          <TrainingWorkspace
            modules={portal.trainingModules}
            resources={portal.resources}
            markCompleteAction={markTrainingCompleteAction}
            returnTo="/ambassador/training"
          />
        ) : null}

        {route === "profile" ? (
          <AmbassadorProfileWorkspace
            ambassador={portal.ambassador}
            regions={portal.regions}
            stats={profileStats}
            action={saveAmbassadorProfileAction}
          />
        ) : null}

        {route === "reports" ? (
          <DataTable
            title="Submitted reports"
            columns={["School", "Presentation", "Submitted", "Attendees", "Status", "Details"]}
            rows={portal.reports.map((report) => [
              report.schoolName,
              report.presentationTitle,
              formatShortDate(report.submittedAt),
              String(report.attendeeCount),
              <StatusBadge key={`${report.id}-status`} value={report.status} />,
              <ReportDetailsButton key={`${report.id}-details`} report={report} />
            ])}
          />
        ) : null}
      </DashboardShell>
    </main>
  );
}

function getAmbassadorNotice(
  searchParams: Record<string, string | string[] | undefined>
): { tone: "success" | "error"; message: string } | null {
  const submitted = readSearchParam(searchParams, "submitted");
  const applied = readSearchParam(searchParams, "applied");
  const completed = readSearchParam(searchParams, "completed");
  const saved = readSearchParam(searchParams, "saved");
  const error = readSearchParam(searchParams, "error");

  if (submitted === "report") {
    return {
      tone: "success",
      message: "Report submitted. Staff can now review the session and payment eligibility."
    };
  }

  if (submitted === "invoice") {
    return {
      tone: "success",
      message:
        "Invoice submitted. The team will send it to finance and you'll be notified once it has been submitted for payment."
    };
  }

  if (saved === "payment-details") {
    return { tone: "success", message: "Payment details saved to your profile." };
  }

  if (applied === "1") {
    return {
      tone: "success",
      message: "Application submitted. Staff will review and assign the best-fit ambassador."
    };
  }

  if (error === "already-applied") {
    return {
      tone: "error",
      message: "You've already applied for that session — staff are reviewing it now."
    };
  }

  if (saved === "profile") {
    return { tone: "success", message: "Profile saved." };
  }

  if (error === "profile-save-failed") {
    return { tone: "error", message: "Your profile couldn't be saved. Please try again." };
  }

  if (completed === "training") {
    return { tone: "success", message: "Training progress saved." };
  }

  if (error === "invalid-payment-details" || error === "invalid-invoice") {
    return {
      tone: "error",
      message:
        "Check your payment details — the bank account number should look like 12-3456-7890123-00."
    };
  }

  if (error === "payment-not-invoiceable") {
    return {
      tone: "error",
      message: "That payment already has an invoice or isn't ready for invoicing yet."
    };
  }

  if (error === "payment-not-found" || error === "ambassador-not-found") {
    return { tone: "error", message: "We couldn't find that payment on your account." };
  }

  if (error === "invoice-save-failed" || error === "payment-details-save-failed") {
    return { tone: "error", message: "Something went wrong while saving. Please try again." };
  }

  return null;
}

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}
