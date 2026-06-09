import {
  CalendarDays,
  ClipboardCheck,
  ImageIcon,
  School2,
  UsersRound,
  Wallet
} from "lucide-react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  bookingRequests,
  paymentRecords,
  reportSummaries,
  tasks
} from "@/lib/domain/demo-data";
import type { DashboardMetric } from "@/lib/domain/types";
import { getStaffPortalData } from "@/lib/services/bookings";
import {
  formatCurrency,
  formatShortDate,
  formatTime,
  formatWeekdayDate
} from "@/lib/utils";

const navItems = [
  { href: "/staff", label: "Overview", icon: ClipboardCheck },
  { href: "/staff/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/staff/schools", label: "Schools", icon: School2 },
  { href: "/staff/ambassadors", label: "Ambassadors", icon: UsersRound },
  { href: "/staff/reports", label: "Reports", icon: ClipboardCheck },
  { href: "/staff/media", label: "Media", icon: ImageIcon },
  { href: "/staff/payments", label: "Payments", icon: Wallet }
];

export default async function StaffPortalPage({
  params
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const route = slug?.join("/") ?? "";
  const portal = await getStaffPortalData();

  const metrics: DashboardMetric[] = [
    {
      label: "Bookings needing action",
      value: "12",
      trend: "+20% vs last week",
      detail: "Assignment, reports, and follow-up",
      icon: "file",
      tone: "amber"
    },
    {
      label: "Upcoming presentations",
      value: "28",
      trend: "+18% vs last week",
      detail: "Scheduled across regions",
      icon: "calendar",
      tone: "green"
    },
    {
      label: "Students reached",
      value: "2,450",
      trend: "+15% vs last week",
      detail: "Expected attendance",
      icon: "users",
      tone: "blue"
    },
    {
      label: "Feedback rating",
      value: "4.8",
      trend: "From 156 reviews",
      detail: "Schools are responding well",
      icon: "star",
      tone: "navy"
    }
  ];

  const sessions = bookingRequests.flatMap((booking) => booking.sessions);
  const bookingsNeedingAction = bookingRequests.filter((booking) =>
    ["ambassador_needed", "tentative", "reschedule_requested"].includes(booking.status)
  );

  const headline =
    route === ""
      ? "Good morning, Jordan Lee"
      : route === "bookings"
        ? "Manage booking requests and sessions"
        : route === "schools"
          ? "Review schools and contacts"
          : route === "ambassadors"
            ? "View ambassador pipeline and assignments"
            : route === "reports"
              ? "Review submitted reports"
              : route === "payments"
                ? "Track payment eligibility"
                : "Staff operations workspace";

  return (
    <main className="pb-12">
      <DashboardShell
        title="Staff Dashboard"
        role="staff"
        navItems={navItems}
        currentPath={`/staff${route ? `/${route}` : ""}`}
        headline={headline}
        subheadline="Here’s what needs attention today across school bookings, ambassador coordination, reporting, and finance workflows."
        dateLabel="This week"
        profile={{
          name: "Jordan Lee",
          subtitle: "Operations Team"
        }}
      >
        {route === "" ? (
          <>
            <MetricGrid metrics={metrics} />

            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="rounded-[34px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                      Bookings needing action
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                      Current operational queue
                    </h2>
                  </div>
                  <ButtonLink href="/staff/bookings" variant="ghost">
                    View all
                  </ButtonLink>
                </div>

                <div className="mt-6 grid gap-4">
                  {bookingsNeedingAction.map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-[color:var(--navy)]">{booking.schoolName}</p>
                          <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                            {booking.sessions[0]?.presentationTitle} · {booking.regionSlug}
                          </p>
                          <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                            {formatShortDate(booking.createdAt)} · {booking.sessions.length} session
                            {booking.sessions.length > 1 ? "s" : ""}
                          </p>
                        </div>
                        <StatusBadge value={booking.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[34px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                      Upcoming presentations
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                      Sessions already on the calendar
                    </h2>
                  </div>
                  <ButtonLink href="/staff/bookings" variant="ghost">
                    View schedule
                  </ButtonLink>
                </div>

                <div className="mt-6 grid gap-4">
                  {sessions.slice(0, 5).map((session) => (
                    <div
                      key={session.id}
                      className="rounded-[22px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-[color:var(--green)]">
                            {formatWeekdayDate(session.startsAt)}
                          </p>
                          <p className="mt-1 font-semibold text-[color:var(--navy)]">
                            {session.presentationTitle}
                          </p>
                          <p className="text-sm text-[color:var(--text-soft)]">
                            {session.schoolName} · {formatTime(session.startsAt)}
                          </p>
                        </div>
                        <StatusBadge value={session.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.9fr_0.85fr]">
              <Card className="rounded-[34px]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Recent feedback
                </p>
                <div className="mt-5 grid gap-4">
                  {reportSummaries.map((report) => (
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

              <Card className="rounded-[34px]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Ambassador applications
                </p>
                <div className="mt-5 grid gap-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-[20px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                    >
                      <p className="font-semibold text-[color:var(--navy)]">{task.title}</p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                        Due {formatShortDate(task.dueAt)} · {task.owner}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[34px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Reports awaiting review
                </p>
                <div className="mt-5 grid gap-4">
                  <SummaryStat label="Session reports" value="12" />
                  <SummaryStat label="Incident reports" value="2" />
                  <SummaryStat label="Feedback reports" value="8" />
                  <SummaryStat label="Pending payments" value={formatCurrency(50000)} />
                </div>
              </Card>
            </div>
          </>
        ) : null}

        {route === "bookings" || route.startsWith("bookings/") || route === "calendar" ? (
          <DataTable
            title="Bookings and sessions"
            columns={["School", "Sessions", "Status", "Created", "Owner"]}
            rows={bookingRequests.map((booking) => [
              booking.schoolName,
              `${booking.sessions.length}`,
              <StatusBadge key={`${booking.id}-status`} value={booking.status} />,
              formatShortDate(booking.createdAt),
              booking.source
            ])}
          />
        ) : null}

        {route === "schools" || route.startsWith("schools/") ? (
          <DataTable
            title="Schools"
            columns={["School", "Region", "City", "Roll size", "Status"]}
            rows={portal.schools.map((school) => [
              school.name,
              school.regionSlug,
              school.city,
              String(school.rollSize),
              <StatusBadge
                key={`${school.id}-status`}
                value={school.status === "active" ? "confirmed" : "tentative"}
              />
            ])}
          />
        ) : null}

        {route === "ambassadors" || route.startsWith("ambassadors/") ? (
          <DataTable
            title="Ambassadors"
            columns={["Name", "Region", "Travel", "Status", "Pending"]}
            rows={portal.ambassadors.map((ambassador) => [
              ambassador.name,
              ambassador.regionSlug,
              ambassador.openToTravel ? "Open to travel" : "Local only",
              <StatusBadge
                key={`${ambassador.id}-status`}
                value={ambassador.status === "approved" ? "confirmed" : "tentative"}
              />,
              formatCurrency(ambassador.pendingPaymentsCents)
            ])}
          />
        ) : null}

        {route === "reports" || route.startsWith("reports/") ? (
          <DataTable
            title="Reports ready for review"
            columns={["School", "Presentation", "Submitted", "Attendees", "Status"]}
            rows={reportSummaries.map((report) => [
              report.schoolName,
              report.presentationTitle,
              formatShortDate(report.submittedAt),
              String(report.attendeeCount),
              <StatusBadge key={`${report.id}-status`} value={report.status} />
            ])}
          />
        ) : null}

        {route === "media" ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Media library
            </h2>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
              The schema and route are ready for media approvals, consent checks,
              internal/public visibility, and linking uploads back to reports, schools, and
              sessions.
            </p>
          </Card>
        ) : null}

        {route === "payments" ? (
          <DataTable
            title="Payment tracker"
            columns={["Ambassador", "Session", "Amount", "Status", "Eligibility"]}
            rows={paymentRecords.map((payment) => [
              payment.ambassadorName,
              payment.bookingSessionId,
              formatCurrency(payment.amountCents),
              <StatusBadge key={`${payment.id}-status`} value={payment.status} />,
              payment.eligibilityReason
            ])}
          />
        ) : null}
      </DashboardShell>
    </main>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4">
      <p className="text-sm text-[color:var(--text-soft)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
        {value}
      </p>
    </div>
  );
}
