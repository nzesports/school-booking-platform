import { BookOpen, CalendarClock, MessageSquare, School2 } from "lucide-react";

import { submitPortalAction } from "@/app/actions";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { resources } from "@/lib/domain/demo-data";
import type { DashboardMetric } from "@/lib/domain/types";
import { getSchoolPortalData } from "@/lib/services/bookings";
import { formatTime, formatWeekdayDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";

const navItems = [
  { href: "/school", label: "Overview", icon: School2 },
  { href: "/school/bookings", label: "Bookings", icon: BookOpen },
  { href: "/school/resources", label: "Resources", icon: CalendarClock },
  { href: "/school/review/session-1001", label: "Reviews", icon: MessageSquare }
];

export default async function SchoolPortalPage({
  params
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const route = slug?.join("/") ?? "";
  const bookings = await getSchoolPortalData();
  const schoolBookings = bookings.filter((booking) =>
    ["Harbour Secondary College", "Aoraki College"].includes(booking.schoolName)
  );

  const metrics: DashboardMetric[] = [
    {
      label: "Active requests",
      value: String(schoolBookings.length),
      trend: "Tentative + confirmed",
      detail: "Across your school account",
      icon: "calendar",
      tone: "green"
    },
    {
      label: "Upcoming sessions",
      value: "3",
      trend: "Across 2 school visits",
      detail: "Confirmed and tentative",
      icon: "clock",
      tone: "blue"
    },
    {
      label: "Resources available",
      value: "1",
      trend: "School facing",
      detail: "Prep and follow-up materials",
      icon: "file",
      tone: "navy"
    },
    {
      label: "Recent review score",
      value: "4.8/5",
      trend: "Latest delivered session",
      detail: "Based on recent school feedback",
      icon: "star",
      tone: "amber"
    }
  ];

  const headline =
    route === ""
      ? "Welcome back, Jules Morgan"
      : route === "bookings"
        ? "Track tentative and confirmed bookings"
        : route.startsWith("resources")
          ? "Access session resources"
          : route.startsWith("review")
            ? "Leave a school review"
            : "School workspace";

  return (
    <main className="pb-12">
      <DashboardShell
        title="School Portal"
        role="school"
        navItems={navItems}
        currentPath={`/school${route ? `/${route}` : ""}`}
        headline={headline}
        subheadline="See your current requests, access session prep materials, and stay aligned with the NZ Esports delivery team."
        dateLabel="Upcoming term"
        profile={{
          name: "Jules Morgan",
          subtitle: "Harbour Secondary College"
        }}
      >
        {route === "" ? (
          <>
            <MetricGrid metrics={metrics} />

            <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
              <Card className="rounded-[34px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                      My bookings
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                      Upcoming and tentative sessions
                    </h2>
                  </div>
                  <ButtonLink href="/school/bookings" variant="ghost">
                    View all
                  </ButtonLink>
                </div>

                <div className="mt-6 grid gap-4">
                  {schoolBookings.map((booking) =>
                    booking.sessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-sm text-[color:var(--text-soft)]">
                              {formatWeekdayDate(session.startsAt)} · {formatTime(session.startsAt)}
                            </p>
                            <p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                              {session.presentationTitle}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                              {session.yearLevels}
                            </p>
                          </div>
                          <StatusBadge value={session.status} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <ButtonLink
                            href={`/school/bookings/${booking.id}`}
                            variant="secondary"
                          >
                            View details
                          </ButtonLink>
                          <ButtonLink
                            href={`/school/bookings/${booking.id}/reschedule`}
                            variant="ghost"
                          >
                            Reschedule
                          </ButtonLink>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <div className="grid gap-5">
                <Card className="rounded-[34px]">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                    School resources
                  </p>
                  <div className="mt-5 grid gap-4">
                    {resources
                      .filter((resource) => resource.audience === "school")
                      .map((resource) => (
                        <div
                          key={resource.id}
                          className="rounded-[22px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                        >
                          <p className="font-semibold text-[color:var(--navy)]">{resource.title}</p>
                          <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
                            {resource.description}
                          </p>
                        </div>
                      ))}
                  </div>
                </Card>

                <Card className="rounded-[34px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)]">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                    Need to change something?
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                    Request a reschedule or leave feedback.
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                    Your school portal is the fastest way to keep sessions aligned with your
                    timetable and space requirements.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <ButtonLink href="/school/review/session-1001">Leave feedback</ButtonLink>
                    <ButtonLink href="/school/bookings/booking-1001/reschedule" variant="secondary">
                      Request reschedule
                    </ButtonLink>
                  </div>
                </Card>
              </div>
            </div>
          </>
        ) : null}

        {route === "bookings" || route.startsWith("bookings/") ? (
          <DataTable
            title="Booking sessions"
            columns={["Presentation", "Schedule", "Status", "Ambassador", "Report"]}
            rows={schoolBookings.flatMap((booking) =>
              booking.sessions.map((session) => [
                session.presentationTitle,
                `${formatWeekdayDate(session.startsAt)} · ${formatTime(session.startsAt)}`,
                <StatusBadge key={`${session.id}-status`} value={session.status} />,
                session.assignedAmbassadorName ?? "Pending assignment",
                <StatusBadge key={`${session.id}-report`} value={session.reportStatus} />
              ])
            )}
          />
        ) : null}

        {route.startsWith("bookings/") && route.endsWith("/reschedule") ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Request a reschedule
            </h2>
            <form action={submitPortalAction} className="mt-6 grid gap-4">
              <input type="hidden" name="scope" value="school" />
              <input type="hidden" name="id" value={slug?.[1] ?? ""} />
              <Input name="preferredDate" type="date" required />
              <Textarea
                name="notes"
                placeholder="Tell staff what changed and any preferred timing."
                required
              />
              <Button type="submit">Submit reschedule request</Button>
            </form>
          </Card>
        ) : null}

        {route.startsWith("bookings/") && route.endsWith("/cancel") ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Request cancellation
            </h2>
            <form action={submitPortalAction} className="mt-6 grid gap-4">
              <input type="hidden" name="scope" value="school" />
              <input type="hidden" name="id" value={slug?.[1] ?? ""} />
              <Textarea
                name="reason"
                placeholder="Share the reason for the cancellation request."
                required
              />
              <Button type="submit" variant="danger">
                Submit cancellation request
              </Button>
            </form>
          </Card>
        ) : null}

        {route === "resources" ? (
          <div className="grid gap-4">
            {resources
              .filter((resource) => resource.audience === "school")
              .map((resource) => (
                <Card key={resource.id} className="rounded-[32px]">
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                    {resource.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                    {resource.description}
                  </p>
                </Card>
              ))}
          </div>
        ) : null}

        {route.startsWith("review/") ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Post-session school feedback
            </h2>
            <form action={submitPortalAction} className="mt-6 grid gap-4">
              <input type="hidden" name="scope" value="school" />
              <input type="hidden" name="id" value={slug?.[1] ?? ""} />
              <Input name="rating" type="number" min={1} max={5} placeholder="5" required />
              <Textarea
                name="feedback"
                placeholder="What worked well, and what should we improve next time?"
                required
              />
              <Button type="submit">Submit feedback</Button>
            </form>
          </Card>
        ) : null}
      </DashboardShell>
    </main>
  );
}
