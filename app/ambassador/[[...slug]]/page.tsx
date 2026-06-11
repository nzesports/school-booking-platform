import {
  BookOpenCheck,
  CalendarCheck2,
  Coins,
  FileSpreadsheet,
  GraduationCap,
  UserRound
} from "lucide-react";

import { logoutAction } from "@/app/auth/actions";
import {
  applyToSessionAction,
  markTrainingCompleteAction,
  submitAmbassadorReportAction
} from "@/app/portal/actions";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { ResourceLibrary } from "@/components/dashboard/resource-library";
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
  { href: "/ambassador/training", label: "Training", icon: GraduationCap }
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
          : route === "earnings"
            ? "Track earnings and payment status"
            : route === "training" || route.startsWith("training/")
              ? "Complete training and access resources"
              : route === "upcoming"
                ? "Your upcoming presentation schedule"
                : "Ambassador workspace";

  const subheadline =
    route === ""
      ? "Here’s what’s happening across your upcoming presentations, applications, and reporting work."
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
          <Card className="rounded-[24px] border-[#b9e2c7] bg-[#f4fbf6] px-5 py-4 text-sm font-semibold text-[#1d6f35]">
            {notice}
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
                      <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                        {report.attendeeCount} attendees · {formatShortDate(report.submittedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[34px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Resource library
                </p>
                <div className="mt-5 grid gap-4">
                  {portal.resources
                    .map((resource) => (
                      <div key={resource.id}>
                        <p className="font-semibold text-[color:var(--navy)]">{resource.title}</p>
                        <p className="mt-1 text-sm leading-7 text-[color:var(--text-soft)]">
                          {resource.description}
                        </p>
                        {resource.downloadUrl ? (
                          <ButtonLink href={resource.downloadUrl} variant="secondary" className="mt-4">
                            Download
                          </ButtonLink>
                        ) : null}
                      </div>
                    ))}
                </div>
                <div className="mt-8 rounded-[24px] bg-white/92 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]">
                  <p className="text-sm text-[color:var(--text-soft)]">Paid so far</p>
                  <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                    {formatCurrency(portal.ambassador.paidPaymentsCents)}
                  </p>
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
              session.regionSlug,
              <StatusBadge key={`${session.id}-status`} value={session.status} />,
              <form key={`${session.id}-apply`} action={applyToSessionAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="bookingSessionId" value={session.id} />
                <input type="hidden" name="returnTo" value="/ambassador/open-bookings" />
                <Button type="submit" variant="secondary">
                  Apply
                </Button>
              </form>
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
          </Card>
        ) : null}

        {route === "upcoming" || route === "completed" ? (
          <DataTable
            title={route === "upcoming" ? "Assigned upcoming sessions" : "Completed sessions"}
            columns={["Presentation", "School", "Time", "Status", "Report"]}
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
                "Available after delivery"
              )
            ])}
          />
        ) : null}

        {selectedReportSessionId ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Submit ambassador report
            </h2>
            <form action={submitAmbassadorReportAction} className="mt-6 grid gap-4">
              <input type="hidden" name="bookingSessionId" value={selectedReportSessionId} />
              <input type="hidden" name="returnTo" value="/ambassador/completed" />
              <div className="grid gap-4 md:grid-cols-3">
                <Input name="attendeeCount" type="number" min={0} placeholder="Attendees" required />
                <Input name="yearLevels" placeholder="Year levels, e.g. Years 9-10" required />
                <select
                  name="teacherResponseRating"
                  required
                  className="min-h-[48px] rounded-[18px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Teacher response
                  </option>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating}/5
                    </option>
                  ))}
                </select>
              </div>
              <select
                name="studentEngagementRating"
                required
                className="min-h-[48px] rounded-[18px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]"
                defaultValue=""
              >
                <option value="" disabled>
                  Student engagement rating
                </option>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}/5
                  </option>
                ))}
              </select>
              <Textarea
                name="presentationFeedback"
                placeholder="Capture attendance, audience reaction, themes, and next-step notes."
                required
              />
              <Textarea
                name="notableQuestions"
                placeholder="Any notable student questions or themes?"
              />
              <label className="flex items-center gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-3 text-sm text-[color:var(--navy)]">
                <input type="checkbox" name="mediaConsentObtained" />
                Media consent was checked or obtained where needed.
              </label>
              <Button type="submit">Submit report</Button>
            </form>
          </Card>
        ) : null}

        {route === "earnings" ? (
          <DataTable
            title="Earnings and payment status"
            columns={["Session", "Amount", "Status", "Eligibility"]}
            rows={ambassadorPayments.map((record) => [
              record.bookingSessionId,
              formatCurrency(record.amountCents),
              <StatusBadge key={`${record.id}-status`} value={record.status} />,
              record.eligibilityReason
            ])}
          />
        ) : null}

        {route === "resources" || route === "training" || route.startsWith("training/") ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {portal.trainingModules.map((module) => (
              <Card key={module.id} className="rounded-[32px]">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                  {module.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                  {module.description}
                </p>
                <p className="mt-4 text-sm font-semibold text-[color:var(--green)]">
                  Progress: {module.progress}%
                </p>
                <form action={markTrainingCompleteAction} className="mt-5">
                  <input type="hidden" name="trainingModuleId" value={module.id} />
                  <input type="hidden" name="returnTo" value="/ambassador/training" />
                  <Button type="submit" variant="secondary">
                    Mark complete
                  </Button>
                </form>
              </Card>
            ))}
            <div className="xl:col-span-2">
              <ResourceLibrary resources={portal.resources} />
            </div>
          </div>
        ) : null}

        {route === "profile" ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Profile settings
            </h2>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
              Banking, travel availability, and role-specific profile fields belong here in the
              full product model.
            </p>
          </Card>
        ) : null}

        {route === "reports" ? (
          <DataTable
            title="Submitted reports"
            columns={["School", "Presentation", "Submitted", "Attendees", "Status"]}
            rows={portal.reports.map((report) => [
              report.schoolName,
              report.presentationTitle,
              formatShortDate(report.submittedAt),
              String(report.attendeeCount),
              <StatusBadge key={`${report.id}-status`} value={report.status} />
            ])}
          />
        ) : null}
      </DashboardShell>
    </main>
  );
}

function getAmbassadorNotice(searchParams: Record<string, string | string[] | undefined>) {
  const submitted = readSearchParam(searchParams, "submitted");
  const applied = readSearchParam(searchParams, "applied");
  const completed = readSearchParam(searchParams, "completed");

  if (submitted === "report") {
    return "Report submitted. Staff can now review the session and payment eligibility.";
  }

  if (applied === "1") {
    return "Application submitted. Staff will review and assign the best-fit ambassador.";
  }

  if (completed === "training") {
    return "Training progress saved.";
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
