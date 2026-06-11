import { BookOpen, CalendarClock, MessageSquare, School2 } from "lucide-react";

import { logoutAction } from "@/app/auth/actions";
import {
  requestSchoolBookingChangeAction,
  submitSchoolReviewAction
} from "@/app/portal/actions";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { ResourceLibrary } from "@/components/dashboard/resource-library";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DashboardMetric } from "@/lib/domain/types";
import { requirePortalAccess } from "@/lib/services/auth";
import { isDeliveredSession } from "@/lib/services/dashboard-insights";
import { getSchoolPortalData } from "@/lib/services/portal";
import { formatTime, formatWeekdayDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";

const navItems = [
  { href: "/school", label: "Overview", icon: School2 },
  { href: "/school/bookings", label: "Bookings", icon: BookOpen },
  { href: "/school/resources", label: "Resources", icon: CalendarClock },
  { href: "/school/bookings", label: "Reviews", icon: MessageSquare }
];

export default async function SchoolPortalPage({
  params,
  searchParams
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const route = slug?.join("/") ?? "";
  const actor = await requirePortalAccess("school");
  const portal = await getSchoolPortalData(actor.id);
  const schoolBookings = portal.bookings;
  const schoolName = portal.school?.name ?? schoolBookings[0]?.schoolName ?? "School account";
  const now = new Date();
  const sessions = schoolBookings.flatMap((booking) => booking.sessions);
  const activeStatuses = new Set([
    "tentative",
    "ambassador_needed",
    "ambassador_applied",
    "ambassador_assigned",
    "confirmed",
    "reschedule_requested"
  ]);
  const activeBookings = schoolBookings.filter((booking) => activeStatuses.has(booking.status));
  const upcomingSessions = sessions.filter(
    (session) => new Date(session.startsAt).getTime() > now.getTime() && session.status !== "cancelled"
  );
  const completedSessions = sessions.filter((session) => isDeliveredSession(session, now));
  const firstBooking = schoolBookings[0] ?? null;
  const firstReviewableSession = sessions.find((session) => isDeliveredSession(session, now));
  const selectedBooking =
    route.startsWith("bookings/") && slug?.length === 2
      ? schoolBookings.find((booking) => booking.id === slug[1])
      : null;
  const notice = getSchoolNotice(resolvedSearchParams);

  const metrics: DashboardMetric[] = [
    {
      label: "Active requests",
      value: String(activeBookings.length),
      trend: "Tentative + confirmed",
      detail: "Across your school account",
      icon: "calendar",
      tone: "green"
    },
    {
      label: "Upcoming sessions",
      value: String(upcomingSessions.length),
      trend: "Across your confirmed and tentative sessions",
      detail: "Confirmed and tentative",
      icon: "clock",
      tone: "blue"
    },
    {
      label: "Resources available",
      value: String(portal.resources.length),
      trend: "School facing",
      detail: "Prep and follow-up materials",
      icon: "file",
      tone: "navy"
    },
    {
      label: "Completed sessions",
      value: String(completedSessions.length),
      trend: `${portal.myReviews.length} reviews submitted`,
      detail: "Delivered sessions and school feedback",
      icon: "star",
      tone: "amber"
    }
  ];

  const headline =
    route === ""
      ? `Welcome back, ${actor.fullName.split(" ")[0]}`
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
        logoutAction={logoutAction}
        profile={{
          name: actor.fullName,
          subtitle: schoolName
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
                  <ButtonLink href="/book">Book another presentation</ButtonLink>
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
                    {portal.resources
                      .map((resource) => (
                        <div
                          key={resource.id}
                          className="rounded-[22px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                        >
                          <p className="font-semibold text-[color:var(--navy)]">{resource.title}</p>
                          <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
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
                    {firstReviewableSession ? (
                      <ButtonLink href={`/school/review/${firstReviewableSession.id}`}>
                        Leave feedback
                      </ButtonLink>
                    ) : null}
                    {firstBooking ? (
                      <>
                        <ButtonLink
                          href={`/school/bookings/${firstBooking.id}/reschedule`}
                          variant="secondary"
                        >
                          Request reschedule
                        </ButtonLink>
                        <ButtonLink
                          href={`/school/bookings/${firstBooking.id}/cancel`}
                          variant="ghost"
                        >
                          Request cancellation
                        </ButtonLink>
                      </>
                    ) : null}
                  </div>
                </Card>
              </div>
            </div>
          </>
        ) : null}

        {route === "bookings" ? (
          <DataTable
            title="Booking sessions"
            columns={["Presentation", "Schedule", "Status", "Ambassador", "Actions"]}
            rows={schoolBookings.flatMap((booking) =>
              booking.sessions.map((session) => [
                session.presentationTitle,
                `${formatWeekdayDate(session.startsAt)} · ${formatTime(session.startsAt)}`,
                <StatusBadge key={`${session.id}-status`} value={session.status} />,
                session.assignedAmbassadorName ?? "Pending assignment",
                <div key={`${session.id}-actions`} className="flex flex-wrap gap-2">
                  <ButtonLink href={`/school/bookings/${booking.id}`} variant="secondary">
                    View details
                  </ButtonLink>
                  <ButtonLink href={`/school/bookings/${booking.id}/reschedule`} variant="ghost">
                    Reschedule
                  </ButtonLink>
                  <ButtonLink href={`/school/bookings/${booking.id}/cancel`} variant="ghost">
                    Cancel
                  </ButtonLink>
                  {isDeliveredSession(session, now) ? (
                    <ButtonLink href={`/school/review/${session.id}`} variant="secondary">
                      Leave review
                    </ButtonLink>
                  ) : null}
                </div>
              ])
            )}
          />
        ) : null}

        {selectedBooking ? (
          <Card className="rounded-[34px]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Booking detail
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                  {selectedBooking.schoolName}
                </h2>
                <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                  {selectedBooking.primaryContactName} · {selectedBooking.primaryContactEmail}
                </p>
              </div>
              <StatusBadge value={selectedBooking.status} />
            </div>

            {selectedBooking.schoolNotes ? (
              <div className="mt-5 rounded-[22px] border border-[color:var(--border-soft)] bg-white/90 px-4 py-4 text-sm leading-7 text-[color:var(--text-soft)]">
                {selectedBooking.schoolNotes}
              </div>
            ) : null}

            <div className="mt-6 grid gap-4">
              {selectedBooking.sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5"
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
                        {session.yearLevels} · {session.expectedStudentCount} expected students
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                        Ambassador: {session.assignedAmbassadorName ?? "Pending assignment"}
                      </p>
                    </div>
                    <StatusBadge value={session.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <ButtonLink
                      href={`/school/bookings/${selectedBooking.id}/reschedule`}
                      variant="secondary"
                    >
                      Reschedule
                    </ButtonLink>
                    <ButtonLink href={`/school/bookings/${selectedBooking.id}/cancel`} variant="ghost">
                      Cancel
                    </ButtonLink>
                    {isDeliveredSession(session, now) ? (
                      <ButtonLink href={`/school/review/${session.id}`} variant="secondary">
                        Leave review
                      </ButtonLink>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {route.startsWith("bookings/") && route.endsWith("/reschedule") ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Request a reschedule
            </h2>
            <form action={requestSchoolBookingChangeAction} className="mt-6 grid gap-4">
              <input type="hidden" name="bookingRequestId" value={slug?.[1] ?? ""} />
              <input type="hidden" name="intent" value="reschedule" />
              <input type="hidden" name="returnTo" value="/school/bookings" />
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
            <form action={requestSchoolBookingChangeAction} className="mt-6 grid gap-4">
              <input type="hidden" name="bookingRequestId" value={slug?.[1] ?? ""} />
              <input type="hidden" name="intent" value="cancel" />
              <input type="hidden" name="returnTo" value="/school/bookings" />
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
          <ResourceLibrary resources={portal.resources} />
        ) : null}

        {route.startsWith("review/") ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Post-session school feedback
            </h2>
            <form action={submitSchoolReviewAction} className="mt-6 grid gap-4">
              <input type="hidden" name="bookingSessionId" value={slug?.[1] ?? ""} />
              <input type="hidden" name="returnTo" value="/school/bookings" />
              <div className="grid gap-4 md:grid-cols-[0.45fr_1fr]">
                <Input name="rating" type="number" min={1} max={5} placeholder="5" required />
                <Input name="attribution" placeholder="e.g. Careers Lead, Harbour College" required />
              </div>
              <Textarea
                name="quote"
                placeholder="What worked well, and what should we improve next time?"
                required
              />
              <label className="flex items-center gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-3 text-sm text-[color:var(--navy)]">
                <input type="checkbox" name="isPublic" />
                Staff can consider this for public testimonials after review.
              </label>
              <Button type="submit">Submit feedback</Button>
            </form>
          </Card>
        ) : null}
      </DashboardShell>
    </main>
  );
}

function getSchoolNotice(searchParams: Record<string, string | string[] | undefined>) {
  const requested = readSearchParam(searchParams, "requested");
  const submitted = readSearchParam(searchParams, "submitted");
  const error = readSearchParam(searchParams, "error");

  if (requested === "reschedule") {
    return "Reschedule request sent. Staff will review availability and follow up.";
  }

  if (requested === "cancel") {
    return "Cancellation request sent. Staff will confirm the next step with you.";
  }

  if (submitted === "review") {
    return "Thanks, your school review has been submitted for staff review.";
  }

  if (error) {
    return `We could not complete that request: ${error.replaceAll("-", " ")}.`;
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
