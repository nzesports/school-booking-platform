import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Coins,
  FileText,
  GraduationCap,
  LockKeyhole,
  MapPin,
  Presentation,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/auth/actions";
import {
  acceptAmbassadorMaterialsConsentAction,
  applyToSessionAction,
  markNotificationReadAction,
  requestSessionWithdrawalAction,
  saveAmbassadorBookingAction,
  saveAmbassadorProfileAction,
  submitAmbassadorReportAction,
  withdrawApplicationAction
} from "@/app/portal/actions";
import { AmbassadorApplicationWithdrawDialog } from "@/components/dashboard/ambassador-application-withdraw-dialog";
import {
  AmbassadorBookingsWorkspace,
  type AmbassadorBookingsTab
} from "@/components/dashboard/ambassador-bookings-workspace";
import { AmbassadorDashboard, EarningsYearChart } from "@/components/dashboard/ambassador-dashboard";
import { AmbassadorManualBookingDialog } from "@/components/dashboard/ambassador-manual-booking-dialog";
import { AmbassadorProfileWorkspace } from "@/components/dashboard/ambassador-profile";
import { PresentationMaterialsWorkspace } from "@/components/dashboard/presentation-materials-workspace";
import { AmbassadorReportForm } from "@/components/dashboard/ambassador-report-form";
import { AmbassadorReportsWorkspace } from "@/components/dashboard/ambassador-reports-workspace";
import { CopyTextButton } from "@/components/dashboard/copy-text-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { TrainingWorkspace } from "@/components/dashboard/training-workspace";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PaymentRecord } from "@/lib/domain/types";
import { requirePortalAccess } from "@/lib/services/auth";
import { getAmbassadorPortalData, loadUserNotifications } from "@/lib/services/portal";
import { formatCurrency, formatShortDate } from "@/lib/utils";

const navItems = [
  { href: "/ambassador", label: "Dashboard", icon: UserRound },
  { href: "/ambassador/bookings", label: "Bookings", icon: BookOpenCheck },
  { href: "/ambassador/reports", label: "Reports", icon: FileText },
  { href: "/ambassador/earnings", label: "Earnings", icon: Coins, separatorBefore: true },
  { href: "/ambassador/training", label: "Training", icon: GraduationCap, separatorBefore: true },
  { href: "/ambassador/materials", label: "Materials", icon: Presentation }
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

  if (route === "resources") {
    redirect("/ambassador/training");
  }

  const actor = await requirePortalAccess("ambassador");
  const portal = await getAmbassadorPortalData(actor.id);
  const notifications = await loadUserNotifications(actor.id);
  const ownedSessions = portal.assignedSessions;
  const now = new Date();
  const upcomingSessions = ownedSessions.filter(
    (session) => new Date(session.startsAt).getTime() > now.getTime() && session.status !== "cancelled"
  );
  const completedSessions = ownedSessions.filter(
    (session) => new Date(session.endsAt).getTime() <= now.getTime() && session.status !== "cancelled"
  );
  const nextReportSession = completedSessions.find(
    (session) => session.reportStatus === "not_submitted"
  );
  const reportableSessions = completedSessions.filter(
    (session) => session.reportStatus === "not_submitted"
  );
  const ambassadorPayments = portal.payments;
  const sessionsById = new Map(ownedSessions.map((session) => [session.id, session]));
  const paymentSessionLabel = (bookingSessionId: string) => {
    const session = sessionsById.get(bookingSessionId);
    return session ? `${session.presentationTitle} · ${session.schoolName}` : bookingSessionId;
  };
  const selectedReportSessionId = route.startsWith("report/")
    ? slug?.[1]
    : route.startsWith("reports/")
      ? slug?.[1]
      : null;
  const trainingResources = portal.resources.filter(
    (resource) =>
      (resource.category === "training" || Boolean(resource.trainingPackIds?.length)) && resource.audiences.includes("ambassador")
  );
  const presentationMaterials = portal.resources.filter(
    (resource) =>
      resource.category === "presentation_material" ||
      (resource.category === "resource" && Boolean(resource.presentationTypeId))
  );
  const materialsConsentAcceptedAt = portal.ambassador.details?.materialsConsentAcceptedAt;
  const notice = getAmbassadorNotice(resolvedSearchParams);
  const reportRatings = portal.reports.flatMap((report) =>
    [report.teacherResponseRating, report.studentEngagementRating].filter(
      (rating): rating is number => typeof rating === "number" && rating > 0
    )
  );
  const profileStats = {
    schoolVisits: completedSessions.length,
    invoicesGeneratedCount: ambassadorPayments.filter(
      (payment) => payment.invoiceNumber || payment.invoiceGeneratedAt
    ).length,
    latestInvoiceGeneratedAt: ambassadorPayments
      .map((payment) => payment.invoiceGeneratedAt)
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
    ratingAverage:
      reportRatings.length > 0
        ? reportRatings.reduce((total, rating) => total + rating, 0) / reportRatings.length
        : null,
    ratingCount: portal.reports.length
  };
  const selectedOpenSession = route.startsWith("open-bookings/")
    ? portal.openSessions.find((session) => session.id === slug?.[1]) ?? null
    : null;
  const isBookingsWorkspaceRoute = [
    "bookings",
    "open-bookings",
    "upcoming",
    "completed",
    "sourced-booking"
  ].includes(route);
  const requestedBookingsTab = readSearchParam(resolvedSearchParams, "tab");
  const validBookingsTabs: AmbassadorBookingsTab[] = [
    "calendar",
    "open",
    "applied",
    "upcoming",
    "sourced",
    "completed"
  ];
  const initialBookingsTab: AmbassadorBookingsTab =
    route === "upcoming"
      ? "upcoming"
      : route === "completed"
        ? "completed"
        : route === "sourced-booking"
          ? "sourced"
          : validBookingsTabs.includes(requestedBookingsTab as AmbassadorBookingsTab)
            ? (requestedBookingsTab as AmbassadorBookingsTab)
            : "open";

  const headline =
    route === ""
      ? `Kia ora, ${actor.fullName.split(" ")[0]}`
      : isBookingsWorkspaceRoute
        ? "Bookings"
      : route.startsWith("open-bookings")
        ? "Find open school bookings"
        : route.startsWith("reports")
          ? "Reports"
          : route === "earnings"
              ? "Track earnings"
              : route === "profile"
                ? "Manage your profile and payment details"
                : route === "training" || route.startsWith("training/")
                  ? "Training"
                  : route === "materials"
                    ? "Download your presentation materials"
                    : route === "upcoming"
                        ? "Your upcoming presentation schedule"
                        : route === "completed"
                          ? "Completed bookings"
                        : "Ambassador portal";

  return (
    <main className="min-h-screen">
      <DashboardShell
        title="Ambassador Portal"
        role="ambassador"
        navItems={navItems}
        currentPath={isBookingsWorkspaceRoute ? "/ambassador/bookings" : `/ambassador${route ? `/${route}` : ""}`}
        headline={headline}
        dateLabel="This month"
        headerAction={
          isBookingsWorkspaceRoute ? (
            <AmbassadorManualBookingDialog
              schools={portal.schools}
              regions={portal.regions}
              presentations={portal.presentations.map(
                ({ id, title, durationMinutes, yearLevels }) => ({
                  id,
                  title,
                  durationMinutes,
                  yearLevels
                })
              )}
              action={saveAmbassadorBookingAction}
              triggerLabel="Submit sourced booking"
              triggerClassName="min-h-[44px] rounded-[14px] border-[#d8c8f4] bg-[#f8f5ff] px-4 text-[#6941c6] shadow-[0_10px_24px_rgba(105,65,198,0.10)] hover:border-[#c5afea] hover:bg-[#f1edfd]"
              returnTo="/ambassador/bookings?tab=sourced"
            />
          ) : route === "training" || route.startsWith("training/") ? (
            <div className="inline-flex items-center gap-2 rounded-[14px] border border-[#efd7a8] bg-white/90 px-3.5 py-2.5 text-sm text-[color:var(--navy)] shadow-sm">
              <LockKeyhole className="h-4 w-4 text-[#a45c00]" aria-hidden="true" />
              <span><span className="font-semibold">Internal training</span> · Ambassador access only</span>
            </div>
          ) : route === "reports" ? (
            nextReportSession ? (
              <ButtonLink href="/ambassador/report/new">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Submit report
              </ButtonLink>
            ) : (
              <ButtonLink href="/ambassador/bookings?tab=completed" variant="secondary">
                View completed bookings
              </ButtonLink>
            )
          ) : undefined
        }
        notifications={notifications}
        markNotificationReadAction={markNotificationReadAction}
        logoutAction={logoutAction}
        profile={{
          name: actor.fullName,
          subtitle: "NZ Esports Ambassador",
          imageUrl: portal.ambassador.imageUrl ?? actor.avatarUrl ?? null,
          imageAlt: `${actor.fullName} profile image`,
          href: "/ambassador/profile"
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
          <AmbassadorDashboard
            ambassador={portal.ambassador}
            openSessions={portal.openSessions}
            upcomingSessions={upcomingSessions}
            completedSessions={completedSessions}
            reports={portal.reports}
            payments={ambassadorPayments}
            trainingModules={portal.trainingModules}
            resources={portal.resources}
            presentations={portal.presentations}
            materialsConsentAcceptedAt={materialsConsentAcceptedAt}
            applyAction={applyToSessionAction}
            withdrawApplicationAction={withdrawApplicationAction}
            requestWithdrawalAction={requestSessionWithdrawalAction}
          />
        ) : null}
        {isBookingsWorkspaceRoute ? (
          <AmbassadorBookingsWorkspace
            key={initialBookingsTab}
            initialTab={initialBookingsTab}
            openSessions={portal.openSessions}
            upcomingSessions={upcomingSessions}
            completedSessions={completedSessions}
            sourcedBookings={portal.sourcedBookings}
            nowIso={now.toISOString()}
            applyAction={applyToSessionAction}
            withdrawApplicationAction={withdrawApplicationAction}
            requestWithdrawalAction={requestSessionWithdrawalAction}
          />
        ) : null}

        {route.startsWith("open-bookings/") ? (
          <Card className="rounded-[34px]">
            <ButtonLink href="/ambassador/bookings" variant="ghost" className="mb-5 min-h-[38px] rounded-[12px] px-2">
              <ArrowLeft className="h-4 w-4" /> Back to open bookings
            </ButtonLink>
            {selectedOpenSession ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--green)]">{selectedOpenSession.presentationTitle}</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">{selectedOpenSession.schoolName}</h2>
                  </div>
                  <StatusBadge value={selectedOpenSession.myApplicationStatus === "applied" ? "applied" : "tentative"} label={selectedOpenSession.myApplicationStatus === "applied" ? "Applied" : "Open"} />
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <BookingDetail icon={<Clock3 className="h-4 w-4" />} label="Date and time" value={`${formatShortDate(selectedOpenSession.startsAt, true)} · ${new Intl.DateTimeFormat("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" }).format(new Date(selectedOpenSession.startsAt))}`} />
                  <BookingDetail icon={<MapPin className="h-4 w-4" />} label="Location" value={selectedOpenSession.regionName ?? selectedOpenSession.regionSlug} />
                  <BookingDetail icon={<UsersRound className="h-4 w-4" />} label="Audience" value={`${selectedOpenSession.expectedStudentCount} students · ${selectedOpenSession.yearLevels}`} />
                </div>
              </>
            ) : null}
            {selectedOpenSession?.myApplicationStatus === "applied" ? (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <p className="inline-flex min-h-[48px] items-center gap-2 rounded-[18px] border border-[rgba(24,168,59,0.28)] bg-[color:var(--green-soft)] px-5 py-3 text-sm font-semibold text-[#1d6f35]">
                  <CheckCircle2 className="h-4 w-4" /> You&apos;ve applied. Staff are reviewing applications now.
                </p>
                <AmbassadorApplicationWithdrawDialog sessionId={selectedOpenSession.id} action={withdrawApplicationAction} returnTo="/ambassador/bookings?tab=applied" />
              </div>
            ) : selectedOpenSession ? (
              <form action={applyToSessionAction} className="mt-6 grid gap-4">
                <input type="hidden" name="bookingSessionId" value={slug?.[1] ?? ""} />
                <input type="hidden" name="returnTo" value="/ambassador/bookings?tab=applied" />
                <Textarea
                  name="message"
                  placeholder="Share why you're a strong fit for this presentation."
                  required
                />
                <Button type="submit">Submit application</Button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-[color:var(--text-soft)]">This booking is no longer available.</p>
            )}
          </Card>
        ) : null}

        {selectedReportSessionId ? (
          <AmbassadorReportForm
            sessions={reportableSessions}
            initialSessionId={selectedReportSessionId === "new" ? undefined : selectedReportSessionId}
            presenterName={actor.fullName}
            action={submitAmbassadorReportAction}
          />
        ) : null}

        {route === "earnings" ? (
          <div className="grid gap-5">
            <Card className="rounded-[26px] border-[#cce8d3] bg-[linear-gradient(110deg,#f2fbf5,#ffffff)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#117a2e]">Payment starts with a report</p>
                  <h2 className="mt-1 text-xl font-semibold text-[color:var(--navy)]">
                    {completedSessions.filter((session) => session.reportStatus === "not_submitted").length > 0
                      ? `${completedSessions.filter((session) => session.reportStatus === "not_submitted").length} completed session report${completedSessions.filter((session) => session.reportStatus === "not_submitted").length === 1 ? " is" : "s are"} waiting`
                      : "All completed sessions have reports"}
                  </h2>
                </div>
                <ButtonLink href="/ambassador/reports">
                  Submit report <ArrowLeft className="h-4 w-4 rotate-180" />
                </ButtonLink>
              </div>
            </Card>
            <div className="grid gap-4 md:grid-cols-3">
              <EarningsMetric
                icon={<Coins className="h-5 w-5" />}
                tone="green"
                label="Total earned"
                value={formatCurrency(portal.ambassador.estimatedEarningsCents)}
                detail="Delivery fees and sourcing bonuses"
              />
              <EarningsMetric
                icon={<CheckCircle2 className="h-5 w-5" />}
                tone="blue"
                label="Paid to date"
                value={formatCurrency(portal.ambassador.paidPaymentsCents)}
                detail={`${ambassadorPayments.filter((payment) => payment.status === "paid").length} completed payment${ambassadorPayments.filter((payment) => payment.status === "paid").length === 1 ? "" : "s"}`}
              />
              <EarningsMetric
                icon={<BookOpenCheck className="h-5 w-5" />}
                tone="amber"
                label="Sourcing bonuses"
                value={formatCurrency(
                  ambassadorPayments.reduce(
                    (total, payment) => total + payment.sourcingBonusCents,
                    0
                  )
                )}
                detail="Additional $50 school-sourcing payments"
              />
            </div>
            <Card className="rounded-[26px]">
              <EarningsYearChart payments={ambassadorPayments} />
            </Card>
            <DataTable
              title="Earnings and payment status"
              columns={[
                "Session",
                "Delivery fee",
                "Sourcing bonus",
                "Total",
                "Status",
                "Approved",
                "Invoice reference"
              ]}
              rows={ambassadorPayments.map((record) => [
                paymentSessionLabel(record.bookingSessionId),
                formatCurrency(record.baseAmountCents),
                record.sourcingBonusCents > 0
                  ? formatCurrency(record.sourcingBonusCents)
                  : "—",
                formatCurrency(record.amountCents),
                <InvoiceStatusBadge key={`${record.id}-status`} record={record} />,
                record.invoiceGeneratedAt ? formatShortDate(record.invoiceGeneratedAt) : "Awaiting approval",
                <EarningsInvoiceAction key={`${record.id}-invoice-action`} record={record} />
              ])}
            />
          </div>
        ) : null}

        {route === "training" || route.startsWith("training/") ? (
          <TrainingWorkspace
            modules={portal.trainingModules}
            presentations={portal.presentations}
            resources={trainingResources}
            packs={portal.trainingPacks}
          />
        ) : null}

        {route === "materials" ? (
          materialsConsentAcceptedAt ? (
            <PresentationMaterialsWorkspace
              resources={presentationMaterials}
              consentAcceptedAt={materialsConsentAcceptedAt}
            />
          ) : (
            <MaterialsConsentForm
              ambassadorName={portal.ambassador.name || actor.fullName}
              action={acceptAmbassadorMaterialsConsentAction}
            />
          )
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
          <AmbassadorReportsWorkspace completedSessions={completedSessions} reports={portal.reports} />
        ) : null}
      </DashboardShell>
    </main>
  );
}

function MaterialsConsentForm({
  ambassadorName,
  action
}: {
  ambassadorName: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card className="mx-auto max-w-4xl overflow-hidden rounded-[30px] p-0 md:p-0">
      <div className="border-b border-[#d8c8f4] bg-[linear-gradient(120deg,#f8f5ff_0%,#ffffff_62%,#f3faf5_100%)] px-6 py-6 md:px-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-white text-[#6941c6] shadow-sm">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#6941c6]">Materials agreement</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">Protect NZ Esports materials</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--text-soft)]">
              Please sign once before opening the materials library. Every item is clearly marked Public or Internal.
            </p>
          </div>
        </div>
      </div>
      <form action={action} className="grid gap-5 p-6 md:p-8">
        <div className="grid gap-3 rounded-[20px] border border-[color:var(--border-soft)] bg-[#f8fafc] p-5 text-sm leading-6 text-[color:var(--navy)]">
          <p className="font-semibold">By accepting, I understand that:</p>
          <ul className="grid list-disc gap-2 pl-5 text-[color:var(--text-dark)]">
            <li>Materials in this portal are sensitive and remain the property of NZ Esports.</li>
            <li>I may share an item only when it carries the Public badge.</li>
            <li>I will not copy, publish, forward, or redistribute anything marked Internal.</li>
          </ul>
        </div>
        <label className="grid gap-2 text-sm font-semibold text-[color:var(--navy)]">
          Full name
          <input
            name="signedName"
            required
            minLength={2}
            defaultValue={ambassadorName}
            className="w-full rounded-[15px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm outline-none focus:border-[#9d86d9] focus:ring-4 focus:ring-[#ede9fe]"
          />
        </label>
        <label className="flex items-start gap-3 rounded-[17px] border border-[#d8c8f4] bg-[#f8f5ff] px-4 py-4 text-sm leading-6 text-[color:var(--navy)]">
          <input type="checkbox" name="accepted" required className="mt-1" />
          <span>I have read and agree to the NZ Esports materials conditions above.</span>
        </label>
        <Button type="submit" className="w-fit rounded-[14px]">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Sign and open materials
        </Button>
      </form>
    </Card>
  );
}

function BookingDetail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-soft)] bg-[#f8fafd] p-4">
      <div className="flex items-center gap-2 text-[#1e4fae]">{icon}<span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">{label}</span></div>
      <p className="mt-2 text-sm font-semibold text-[color:var(--navy)]">{value}</p>
    </div>
  );
}

function EarningsInvoiceAction({ record }: { record: PaymentRecord }) {
  if (record.invoiceNumber) {
    return (
      <div className="flex min-w-[190px] items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
        <span>{record.invoiceNumber}</span>
        <CopyTextButton value={record.invoiceNumber} label={`Copy ${record.invoiceNumber}`} />
      </div>
    );
  }

  return <span className="block min-w-[190px] text-xs text-[color:var(--text-soft)]">Generated automatically after approval</span>;
}

function EarningsMetric({
  icon,
  tone,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  tone: "green" | "blue" | "amber";
  label: string;
  value: string;
  detail: string;
}) {
  const toneClasses = {
    green: "bg-[#e6f6eb] text-[#117a2e]",
    blue: "bg-[#e8f1fd] text-[#1e4fae]",
    amber: "bg-[#fff5df] text-[#9a5a00]"
  };

  return (
    <Card className="rounded-[24px] p-5 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
            {value}
          </p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-[14px] ${toneClasses[tone]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-2 text-sm text-[color:var(--text-soft)]">{detail}</p>
    </Card>
  );
}

function InvoiceStatusBadge({
  record
}: {
  record: {
    status: PaymentRecord["status"];
    paidAt?: string;
  };
}) {
  const label = record.status === "paid" ? "Paid" : record.status === "approved" ? "Approved" : "Received";
  const className =
    record.status === "paid"
      ? "border-[rgba(24,168,59,0.22)] bg-[color:var(--green-soft)] text-[#1d6f35]"
      : record.status === "approved"
        ? "border-[#d9cff9] bg-[#f5f1ff] text-[#5d41b8]"
        : "border-[#c8dcfb] bg-[#f5f9ff] text-[#1e4fae]";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function getAmbassadorNotice(
  searchParams: Record<string, string | string[] | undefined>
): { tone: "success" | "error"; message: string } | null {
  const submitted = readSearchParam(searchParams, "submitted");
  const applied = readSearchParam(searchParams, "applied");
  const requested = readSearchParam(searchParams, "requested");
  const withdrawn = readSearchParam(searchParams, "withdrawn");
  const created = readSearchParam(searchParams, "created");
  const saved = readSearchParam(searchParams, "saved");
  const error = readSearchParam(searchParams, "error");

  if (submitted === "report") {
    return {
      tone: "success",
      message: "Report received. Staff can now review it; eligible payments will be sent to finance automatically after approval."
    };
  }

  if (created === "ambassador-booking") {
    return {
      tone: "success",
      message: "Booking logged and assigned to you. It is flagged as Ambassador Booked for the $300 payment rate."
    };
  }

  if (saved === "materials-consent") {
    return {
      tone: "success",
      message: "Materials agreement signed. Public and Internal sharing labels are now shown on every item."
    };
  }

  if (applied === "1") {
    return {
      tone: "success",
      message: "Application submitted. Staff will review and assign the best-fit ambassador."
    };
  }

  if (requested === "withdrawal") {
    return {
      tone: "success",
      message:
        "Withdrawal request sent. Staff will review it and you'll be notified of the outcome; the session stays yours until then."
    };
  }

  if (withdrawn === "application") {
    return {
      tone: "success",
      message: "Application withdrawn. You can re-apply later while the session remains open."
    };
  }

  if (error === "already-applied") {
    return {
      tone: "error",
      message: "You've already applied for that session — staff are reviewing it now."
    };
  }

  if (error === "invalid-ambassador-booking") {
    return {
      tone: "error",
      message: "Check the booking details and try again. All required fields need a valid value."
    };
  }

  if (
    error === "materials-consent-required" ||
    error === "materials-consent-save-failed"
  ) {
    return {
      tone: "error",
      message: "Please enter your name, accept the materials conditions, and try again."
    };
  }

  if (
    error === "booking-school-missing" ||
    error === "booking-presentation-missing" ||
    error === "booking-save-failed" ||
    error === "booking-session-save-failed" ||
    error === "ambassador-booking-profile-missing"
  ) {
    return {
      tone: "error",
      message: "That booking could not be saved. Refresh the page and try again."
    };
  }

  if (error === "invalid-withdrawal") {
    return {
      tone: "error",
      message: "Add a reason of at least five characters before sending a withdrawal request."
    };
  }

  if (error === "withdrawal-already-requested") {
    return {
      tone: "error",
      message: "A withdrawal request is already awaiting staff review for that session."
    };
  }

  if (error === "withdrawal-not-allowed") {
    return { tone: "error", message: "That session cannot be withdrawn from right now." };
  }

  if (error === "session-already-started") {
    return {
      tone: "error",
      message: "This session has already started, so contact the team directly for urgent changes."
    };
  }

  if (error === "not-your-session") {
    return { tone: "error", message: "That session is not assigned to your account." };
  }

  if (error === "report-media-invalid") {
    return {
      tone: "error",
      message: "Choose no more than 15 report files and keep each file at 5 MB or smaller."
    };
  }

  if (error === "session-not-finished") {
    return {
      tone: "error",
      message: "Reports can only be submitted for your completed school bookings."
    };
  }

  if (error === "application-not-found") {
    return {
      tone: "error",
      message: "We couldn't find an active application to withdraw for that session."
    };
  }

  if (saved === "profile") {
    return { tone: "success", message: "Profile saved." };
  }

  if (error === "profile-save-failed") {
    return { tone: "error", message: "Your profile couldn't be saved. Please try again." };
  }

  if (error === "invalid-payment-details") {
    return {
      tone: "error",
      message:
        "Check your payment details — the bank account number should look like 12-3456-7890123-00."
    };
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
