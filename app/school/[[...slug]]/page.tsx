import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  FolderOpen,
  Hourglass,
  Mail,
  MessageSquare,
  MessageSquarePlus,
  PackageOpen,
  Play,
  Plus,
  School2,
  Star,
  UserRound,
  UsersRound,
  Zap
} from "lucide-react";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/auth/actions";
import {
  markNotificationReadAction,
  requestSchoolBookingChangeAction,
  saveSchoolProfileAction,
  submitSchoolReviewAction
} from "@/app/portal/actions";
import { BookPresentationButton } from "@/components/site/book-presentation-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SchoolLogoUploader } from "@/components/dashboard/school-logo-uploader";
import { SchoolReviewSubmissionButton } from "@/components/dashboard/school-review-submission-dialog";
import {
  SchoolBookingsExplorer,
  type SchoolSessionRow
} from "@/components/dashboard/school-bookings-explorer";
import { SchoolResourceLibrary } from "@/components/dashboard/school-resource-library";
import { SchoolFeedbackForm } from "@/components/site/school-feedback-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requirePortalAccess } from "@/lib/services/auth";
import { isDeliveredSession } from "@/lib/services/dashboard-insights";
import { getSchoolPortalData, loadUserNotifications } from "@/lib/services/portal";
import { cn, formatShortDate, formatTime, formatWeekdayDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";

const navItems = [
  { href: "/school", label: "Overview", icon: School2 },
  { href: "/school/bookings", label: "Bookings", icon: BookOpen },
  { href: "/school/resources", label: "Resources", icon: CalendarClock },
  { href: "/school/reviews", label: "Reviews", icon: MessageSquare },
  { href: "/school/profile", label: "Profile", icon: UserRound }
];

type OverviewResource = {
  type: string;
  youtubeUrl?: string;
  downloadUrl?: string;
  externalUrl?: string;
};

function overviewResourceUrl(resource: OverviewResource) {
  return resource.youtubeUrl ?? resource.downloadUrl ?? resource.externalUrl ?? null;
}

function isOverviewVideoResource(resource: OverviewResource) {
  return resource.type === "youtube" || resource.type === "video" || Boolean(resource.youtubeUrl);
}

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
  const notifications = await loadUserNotifications(actor.id);
  const schoolBookings = portal.bookings;
  const schoolName = portal.school?.name ?? schoolBookings[0]?.schoolName ?? "School account";
  const now = new Date();
  const sessions = schoolBookings.flatMap((booking) =>
    booking.sessions.map((session) => ({ session, bookingId: booking.id }))
  );
  const reviewedSessionIds = new Set(
    portal.myReviews.map((review) => review.bookingSessionId).filter(Boolean)
  );
  const sessionRows: SchoolSessionRow[] = sessions.map(({ session, bookingId }) => ({
    session,
    bookingId,
    isDelivered: isDeliveredSession(session, now),
    hasReview: reviewedSessionIds.has(session.id)
  }));
  const activeStatuses = new Set([
    "tentative",
    "ambassador_needed",
    "ambassador_applied",
    "ambassador_assigned",
    "confirmed",
    "reschedule_requested"
  ]);
  const activeBookings = schoolBookings.filter((booking) => activeStatuses.has(booking.status));
  const upcomingRows = sessionRows
    .filter(
      (row) =>
        new Date(row.session.startsAt).getTime() > now.getTime() &&
        row.session.status !== "cancelled"
    )
    .sort(
      (a, b) => new Date(a.session.startsAt).getTime() - new Date(b.session.startsAt).getTime()
    );
  const completedRows = sessionRows.filter((row) => row.isDelivered);
  const tentativeRows = sessionRows.filter(
    (row) =>
      !row.isDelivered &&
      row.session.status !== "cancelled" &&
      row.session.status !== "confirmed" &&
      row.session.status !== "ambassador_assigned"
  );
  const readyForFeedbackRows = completedRows.filter((row) => !row.hasReview);
  const reviewRatingValues = portal.myReviews
    .map((review) => review.rating)
    .filter((rating): rating is number => typeof rating === "number");
  const averageReviewRating =
    reviewRatingValues.length > 0
      ? (
          reviewRatingValues.reduce((total, rating) => total + rating, 0) /
          reviewRatingValues.length
        ).toFixed(1)
      : "0.0";
  const reviewSessionRowsById = new Map(
    sessionRows.map((row) => [row.session.id, row] as const)
  );
  // "What's next" prefers the next upcoming session, falling back to the most
  // recently delivered one (so there's always something actionable).
  const whatsNext =
    upcomingRows[0] ??
    [...completedRows].sort(
      (a, b) => new Date(b.session.startsAt).getTime() - new Date(a.session.startsAt).getTime()
    )[0] ??
    null;
  const recentRows = [...sessionRows]
    .sort(
      (a, b) => new Date(b.session.startsAt).getTime() - new Date(a.session.startsAt).getTime()
    )
    .slice(0, 5);
  const selectedBooking =
    route.startsWith("bookings/") && slug?.length === 2
      ? schoolBookings.find((booking) => booking.id === slug[1])
      : null;
  const reviewSessionRow = route.startsWith("review/")
    ? sessionRows.find((row) => row.session.id === slug?.[1])
    : null;
  const selectedReview =
    route.startsWith("reviews/") && slug?.length === 2
      ? portal.myReviews.find((review) => review.id === slug[1])
      : null;
  const selectedReviewSessionRow = selectedReview?.bookingSessionId
    ? reviewSessionRowsById.get(selectedReview.bookingSessionId)
    : undefined;
  const notice = getSchoolNotice(resolvedSearchParams);

  const headline =
    route === ""
      ? `Welcome back, ${actor.fullName.split(" ")[0]}`
      : route === "bookings"
        ? "Track tentative and confirmed bookings"
        : route.startsWith("resources")
          ? "Resources"
          : route.startsWith("reviews")
            ? "Share feedback on your sessions"
            : route === "profile"
              ? "Your school profile"
              : route.startsWith("review")
                ? "Leave session feedback"
                : "School workspace";

  return (
    <main className="min-h-screen">
      <DashboardShell
        title="School Portal"
        role="school"
        navItems={navItems}
        currentPath={`/school${route ? `/${route}` : ""}`}
        headline={headline}
        subheadline={
          route === ""
            ? "Here's what's happening with your bookings, resources and school activity."
            : route.startsWith("resources")
              ? undefined
              : "See your current requests, access session prep materials, and stay aligned with the NZ Esports delivery team."
        }
        dateLabel="Upcoming term"
        notifications={notifications}
        markNotificationReadAction={markNotificationReadAction}
        logoutAction={logoutAction}
        profile={{
          name: actor.fullName,
          subtitle: schoolName,
          imageUrl: portal.school?.logoUrl ?? null,
          imageAlt: `${schoolName} logo`
        }}
      >
        {notice ? (
          <Card className="rounded-[24px] border-[#b9e2c7] bg-[#f4fbf6] px-5 py-4 text-sm font-semibold text-[#1d6f35]">
            {notice}
          </Card>
        ) : null}

        {route === "" ? (
          <div className="grid gap-5">
            {whatsNext ? (
              <Card
                className="rounded-[28px]"
                style={{ borderLeft: "4px solid var(--green)" }}
              >
                <div className="flex flex-wrap items-start gap-5">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-[color:var(--green-soft)] text-[#117a2e]">
                    <CalendarDays className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                      What&apos;s happening next
                    </p>
                    <h2 className="mt-1.5 text-3xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                      {whatsNext.session.presentationTitle}
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[color:var(--navy)]">
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-[color:var(--text-soft)]" />
                        {formatShortDate(whatsNext.session.startsAt)} ·{" "}
                        {formatTime(whatsNext.session.startsAt)}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <UsersRound className="h-4 w-4 text-[color:var(--text-soft)]" />
                        {whatsNext.session.yearLevels}
                      </span>
                      <StatusBadge
                        value={whatsNext.isDelivered ? "completed" : whatsNext.session.status}
                      />
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <ButtonLink
                        href={`/school/bookings/${whatsNext.bookingId}`}
                        className="min-h-[42px] rounded-[14px] px-4"
                      >
                        View details
                        <ArrowRight className="h-4 w-4" />
                      </ButtonLink>
                      {whatsNext.isDelivered && !whatsNext.hasReview ? (
                        <ButtonLink
                          href={`/school/review/${whatsNext.session.id}`}
                          variant="secondary"
                          className="min-h-[42px] rounded-[14px] px-4"
                        >
                          <Star className="h-4 w-4" />
                          Leave review
                        </ButtonLink>
                      ) : (
                        <ButtonLink
                          href={`/school/bookings/${whatsNext.bookingId}/reschedule`}
                          variant="secondary"
                          className="min-h-[42px] rounded-[14px] px-4"
                        >
                          <CalendarClock className="h-4 w-4" />
                          Reschedule
                        </ButtonLink>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ) : null}

            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <SchoolStatTile
                icon={<CalendarCheck2 className="h-5 w-5" />}
                iconClassName="bg-[#e6f5ec] text-[#117a2e]"
                label="Active requests"
                value={String(activeBookings.length)}
                hint="Across your school account"
              />
              <SchoolStatTile
                icon={<CalendarDays className="h-5 w-5" />}
                iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
                label="Upcoming sessions"
                value={String(upcomingRows.length)}
                hint="Across your school account"
              />
              <SchoolStatTile
                icon={<FolderOpen className="h-5 w-5" />}
                iconClassName="bg-[#f1edfd] text-[#7c3aed]"
                label="Resources available"
                value={String(portal.resources.length)}
                hint="Prep and follow-up materials"
              />
              <SchoolStatTile
                icon={<Star className="h-5 w-5" />}
                iconClassName="bg-[#fdf3dc] text-[#b7822c]"
                label="Completed sessions"
                value={String(completedRows.length)}
                hint="Delivered sessions and feedback"
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="grid content-start gap-5">
                <Card className="rounded-[28px]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                      <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[color:var(--green-soft)] text-[#117a2e]">
                        <CalendarDays className="h-4 w-4" />
                      </span>
                      Recent bookings
                    </p>
                    <ButtonLink
                      href="/school/bookings"
                      variant="ghost"
                      className="min-h-[36px] rounded-[12px] px-3 py-1 text-[13px]"
                    >
                      View all
                      <ArrowRight className="h-4 w-4" />
                    </ButtonLink>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-[520px] border-separate border-spacing-0 lg:min-w-full">
                      <thead>
                        <tr>
                          {["Session", "Date & time", "Audience", "Status"].map((heading) => (
                            <th
                              key={heading}
                              className="border-b border-[color:rgba(4,15,75,0.08)] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]"
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {recentRows.map((row) => (
                          <tr key={row.session.id}>
                            <td className="border-b border-[color:rgba(4,15,75,0.05)] px-3 py-3.5 text-sm font-semibold text-[color:var(--navy)]">
                              {row.session.presentationTitle}
                            </td>
                            <td className="border-b border-[color:rgba(4,15,75,0.05)] px-3 py-3.5 text-sm text-[color:var(--navy)]">
                              {formatShortDate(row.session.startsAt)} ·{" "}
                              {formatTime(row.session.startsAt)}
                            </td>
                            <td className="border-b border-[color:rgba(4,15,75,0.05)] px-3 py-3.5 text-sm text-[color:var(--navy)]">
                              {row.session.yearLevels}
                            </td>
                            <td className="border-b border-[color:rgba(4,15,75,0.05)] px-3 py-3.5">
                              <StatusBadge
                                value={row.isDelivered ? "completed" : row.session.status}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {recentRows.length === 0 ? (
                      <p className="px-3 py-8 text-sm text-[color:var(--text-soft)]">
                        No bookings yet — request your first presentation to get started.
                      </p>
                    ) : null}
                  </div>
                </Card>

                <Card className="rounded-[28px]">
                  <p className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#fdf3dc] text-[#b7822c]">
                      <Zap className="h-4 w-4" />
                    </span>
                    Quick actions
                  </p>
                  <p className="mt-1.5 text-sm text-[color:var(--text-soft)]">
                    Need to make a change or manage your bookings?
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <BookPresentationButton
                      variant="secondary"
                      className="min-h-[52px] justify-between rounded-[16px] px-4 text-left text-sm font-semibold"
                    >
                      <span className="flex items-center gap-2.5 whitespace-nowrap">
                        <CalendarDays className="h-4 w-4" />
                        Book presentation
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                    </BookPresentationButton>
                    <QuickAction
                      href="/school/reviews"
                      icon={<MessageSquarePlus className="h-4 w-4" />}
                      label="Leave feedback"
                    />
                    <QuickAction
                      href="/school/bookings"
                      icon={<CalendarClock className="h-4 w-4" />}
                      label="Request reschedule"
                    />
                  </div>
                </Card>

                <SchoolContactCallout />
              </div>

              <Card className="rounded-[28px]">
                <p className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#f1edfd] text-[#7c3aed]">
                    <FolderOpen className="h-4 w-4" />
                  </span>
                  School resources
                </p>

                {portal.resources.length === 0 ? (
                  <div className="mt-10 grid justify-items-center gap-3 px-4 pb-6 text-center">
                    <PackageOpen className="h-14 w-14 text-[#cbd5e1]" />
                    <p className="text-base font-semibold text-[color:var(--navy)]">
                      No resources available yet
                    </p>
                    <p className="max-w-[260px] text-sm leading-6 text-[color:var(--text-soft)]">
                      Resources will appear here when they&apos;re shared with your school.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {portal.resources.slice(0, 4).map((resource) => {
                      const actionUrl = overviewResourceUrl(resource);
                      const isVideoResource = isOverviewVideoResource(resource);

                      return (
                        <div
                          key={resource.id}
                          className="rounded-[18px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                        >
                          <p className="font-semibold text-[color:var(--navy)]">{resource.title}</p>
                          {resource.description ? (
                            <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">
                              {resource.description}
                            </p>
                          ) : null}
                          {actionUrl ? (
                            <ButtonLink
                              href={actionUrl}
                              target={actionUrl.startsWith("/") ? undefined : "_blank"}
                              rel={actionUrl.startsWith("/") ? undefined : "noreferrer"}
                              variant="secondary"
                              className="mt-3 min-h-[34px] rounded-[11px] px-3 py-1 text-[13px]"
                            >
                              {isVideoResource ? <Play className="h-3.5 w-3.5 fill-current" /> : null}
                              {isVideoResource ? "Watch video" : "Download"}
                            </ButtonLink>
                          ) : null}
                        </div>
                      );
                    })}
                    <ButtonLink
                      href="/school/resources"
                      variant="ghost"
                      className="min-h-[36px] justify-start rounded-[12px] px-2 py-1 text-[13px]"
                    >
                      View all resources
                      <ArrowRight className="h-4 w-4" />
                    </ButtonLink>
                  </div>
                )}
              </Card>
            </div>
          </div>
        ) : null}

        {route === "bookings" ? (
          <div className="grid gap-5">
            <div className="flex justify-end">
              <BookPresentationButton className="min-h-[44px] rounded-[14px] border-[#149238] bg-[color:var(--green)] px-4 text-white shadow-[0_12px_28px_rgba(24,168,59,0.24)] hover:border-[#0f7c2e] hover:bg-[#128a30]">
                <Plus className="h-4 w-4" />
                Book Presentation
              </BookPresentationButton>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <SchoolStatTile
                icon={<CalendarDays className="h-5 w-5" />}
                iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
                label="Total bookings"
                value={String(sessionRows.length)}
              />
              <SchoolStatTile
                icon={<Hourglass className="h-5 w-5" />}
                iconClassName="bg-[#fdf3dc] text-[#b7822c]"
                label="Tentative"
                value={String(tentativeRows.length)}
              />
              <SchoolStatTile
                icon={<CircleCheck className="h-5 w-5" />}
                iconClassName="bg-[#e6f5ec] text-[#117a2e]"
                label="Confirmed / Completed"
                value={String(
                  sessionRows.filter(
                    (row) =>
                      row.isDelivered ||
                      row.session.status === "confirmed" ||
                      row.session.status === "ambassador_assigned"
                  ).length
                )}
              />
            </div>

            {whatsNext ? (
              <Card
                className="rounded-[28px]"
                style={{ borderLeft: "4px solid var(--green)" }}
              >
                <div className="flex flex-wrap items-center gap-5">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[color:var(--green-soft)] text-[#117a2e]">
                    <UsersRound className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                      What&apos;s next
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                      {whatsNext.session.presentationTitle}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[color:var(--navy)]">
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-[color:var(--text-soft)]" />
                        {formatWeekdayDate(whatsNext.session.startsAt)} ·{" "}
                        {formatTime(whatsNext.session.startsAt)}
                      </span>
                      <span aria-hidden className="h-4 w-px bg-[rgba(4,15,75,0.14)]" />
                      <StatusBadge
                        value={whatsNext.isDelivered ? "completed" : whatsNext.session.status}
                      />
                      {whatsNext.session.assignedAmbassadorName ? (
                        <>
                          <span aria-hidden className="h-4 w-px bg-[rgba(4,15,75,0.14)]" />
                          <span className="inline-flex items-center gap-2 text-[color:var(--navy)]">
                            <UserRound className="h-4 w-4 text-[color:var(--text-soft)]" />
                            {whatsNext.session.assignedAmbassadorName}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <ButtonLink
                      href={`/school/bookings/${whatsNext.bookingId}`}
                      className="min-h-[42px] rounded-[14px] border-[#149238] bg-[color:var(--green)] px-4 text-white hover:border-[#0f7c2e] hover:bg-[#128a30]"
                    >
                      View details
                    </ButtonLink>
                    {whatsNext.isDelivered && !whatsNext.hasReview ? (
                      <ButtonLink
                        href={`/school/review/${whatsNext.session.id}`}
                        variant="secondary"
                        className="min-h-[42px] rounded-[14px] px-4"
                      >
                        Leave review
                      </ButtonLink>
                    ) : null}
                  </div>
                </div>
              </Card>
            ) : null}

            <Card className="rounded-[28px]">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                All booking sessions
              </h2>
              <div className="mt-4">
                <SchoolBookingsExplorer rows={sessionRows} />
              </div>
            </Card>

            <SchoolContactCallout />
          </div>
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
                    {isDeliveredSession(session, now) ? (
                      !reviewedSessionIds.has(session.id) ? (
                        <ButtonLink href={`/school/review/${session.id}`}>
                          <Star className="h-4 w-4" />
                          Leave review
                        </ButtonLink>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-full bg-[#eaf8ee] px-3.5 py-1.5 text-sm font-semibold text-[#117a2e]">
                          <CircleCheck className="h-4 w-4" />
                          Feedback submitted
                        </span>
                      )
                    ) : session.status !== "cancelled" ? (
                      <>
                        <ButtonLink
                          href={`/school/bookings/${selectedBooking.id}/reschedule`}
                          variant="secondary"
                        >
                          <CalendarClock className="h-4 w-4" />
                          Reschedule
                        </ButtonLink>
                        <ButtonLink
                          href={`/school/bookings/${selectedBooking.id}/cancel`}
                          variant="danger"
                        >
                          Request cancellation
                        </ButtonLink>
                      </>
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
          <SchoolResourceLibrary resources={portal.resources} />
        ) : null}

        {route === "reviews" ? (
          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-3">
              <ReviewMetricTile
                icon={<MessageSquare className="h-6 w-6" />}
                iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
                value={String(readyForFeedbackRows.length)}
                label="Ready for feedback"
                hint="Sessions awaiting your feedback"
              />
              <ReviewMetricTile
                icon={<CircleCheck className="h-6 w-6" />}
                iconClassName="bg-[#e6f5ec] text-[#117a2e]"
                value={String(portal.myReviews.length)}
                label="Feedback submitted"
                hint="Sessions you've completed"
              />
              <ReviewMetricTile
                icon={<Star className="h-6 w-6" />}
                iconClassName="bg-[#fdf3dc] text-[#b7822c]"
                value={averageReviewRating}
                label="Average rating"
                hint="From your submitted feedback"
              />
            </div>

            <Card className="rounded-[28px]">
              <ReviewPanelHeading
                icon={<MessageSquare className="h-5 w-5" />}
                iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
                title="Sessions ready for feedback"
                hint="Your feedback goes straight to the NZ Esports team and helps shape future presentations. It takes about two minutes per session."
              />
              <div className="mt-5 grid gap-3">
                {readyForFeedbackRows.length === 0 ? (
                  <p className="rounded-[22px] border border-dashed border-[color:var(--border-soft)] bg-white/85 px-4 py-8 text-center text-sm text-[color:var(--text-soft)]">
                    You&apos;re all caught up. Delivered sessions will appear here when they are
                    ready for feedback.
                  </p>
                ) : null}
                {readyForFeedbackRows.map((row) => (
                  <div
                    key={row.session.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-[#b9d7fb] bg-[linear-gradient(135deg,#fbfdff,#f8fcff)] px-5 py-5"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-[#e8f1fd] text-[#1e4fae]">
                        <CalendarDays className="h-7 w-7" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xl font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
                          {row.session.presentationTitle}
                        </p>
                        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--text-soft)]">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4 text-[color:var(--navy)]" />
                            {formatShortDate(row.session.startsAt)} -{" "}
                            {formatTime(row.session.startsAt)}
                          </span>
                          {row.session.assignedAmbassadorName ? (
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="h-4 w-4 text-[color:var(--navy)]" />
                              {row.session.assignedAmbassadorName}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="inline-flex items-center gap-2 rounded-full bg-[#eaf8ee] px-4 py-2 text-sm font-semibold text-[#117a2e]">
                        <span className="h-2 w-2 rounded-full bg-[color:var(--green)]" />
                        Ready now
                      </span>
                      <ButtonLink
                        href={`/school/review/${row.session.id}`}
                        className="min-h-[48px] rounded-[15px] border-[#155bd4] bg-[#1765dc] px-5 text-white shadow-[0_14px_28px_rgba(23,101,220,0.2)] hover:border-[#124fb7] hover:bg-[#1458c4]"
                      >
                        <Star className="h-4 w-4" />
                        Leave feedback
                      </ButtonLink>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-[28px]">
              <ReviewPanelHeading
                icon={<MessageSquare className="h-5 w-5" />}
                iconClassName="bg-[#e6f5ec] text-[#117a2e]"
                title="Feedback you've shared"
                hint="Thanks for helping us improve future sessions."
              />
              <div className="mt-5 grid gap-3">
                {portal.myReviews.length === 0 ? (
                  <p className="rounded-[22px] border border-dashed border-[color:var(--border-soft)] bg-white/85 px-4 py-8 text-center text-sm text-[color:var(--text-soft)]">
                    Submitted feedback will appear here after you complete a review.
                  </p>
                ) : null}
                {portal.myReviews.map((review) => {
                  const row = review.bookingSessionId
                    ? reviewSessionRowsById.get(review.bookingSessionId)
                    : undefined;
                  const rating = review.rating ?? 0;

                  return (
                    <div
                      key={review.id}
                      className="grid gap-4 rounded-[24px] border border-[#c9ead1] bg-[linear-gradient(135deg,#fbfffc,#f8fcff)] px-5 py-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,1fr)_auto_auto] lg:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[#e6f5ec] text-[#117a2e]">
                          <CalendarDays className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-[color:var(--navy)]">
                            {review.presentationTitle}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--text-soft)]">
                            <span>
                              {row
                                ? `${formatShortDate(row.session.startsAt)} - ${formatTime(row.session.startsAt)}`
                                : formatShortDate(review.createdAt)}
                            </span>
                            {row?.session.assignedAmbassadorName ? (
                              <span className="inline-flex items-center gap-1.5">
                                <UserRound className="h-4 w-4 text-[color:var(--navy)]" />
                                {row.session.assignedAmbassadorName}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <p className="border-y border-[rgba(4,15,75,0.08)] py-4 text-sm font-medium italic leading-6 text-[color:var(--navy)] lg:border-x lg:border-y-0 lg:px-6 lg:py-0">
                        <span className="mr-2 text-2xl font-semibold text-[color:var(--green)]">
                          &ldquo;
                        </span>
                        {review.quote}
                      </p>
                      <div className="grid justify-items-start gap-1 lg:justify-items-center">
                        <ReviewRatingStars rating={rating} />
                        {review.rating ? (
                          <p className="text-sm font-semibold text-[color:var(--navy)]">
                            {review.rating} / 5
                          </p>
                        ) : null}
                      </div>
                      <SchoolReviewSubmissionButton
                        review={review}
                        session={
                          row
                            ? {
                                startsAt: row.session.startsAt,
                                ambassadorName: row.session.assignedAmbassadorName
                              }
                            : undefined
                        }
                        className="min-h-[42px] rounded-[13px] px-4 text-[13px]"
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        ) : null}

        {route.startsWith("reviews/") ? (
          selectedReview ? (
            <Card className="rounded-[28px]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <ReviewPanelHeading
                  icon={<MessageSquare className="h-5 w-5" />}
                  iconClassName="bg-[#e6f5ec] text-[#117a2e]"
                  title="Your feedback submission"
                  hint="This is the feedback you shared with the NZ Esports team."
                />
                <ButtonLink
                  href="/school/reviews"
                  variant="secondary"
                  className="min-h-[42px] rounded-[13px] px-4 text-[13px]"
                >
                  Back to reviews
                </ButtonLink>
              </div>

              <div className="mt-6 grid gap-4 rounded-[24px] border border-[#c9ead1] bg-[linear-gradient(135deg,#fbfffc,#f8fcff)] px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-[#e6f5ec] text-[#117a2e]">
                    <CalendarDays className="h-7 w-7" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                      {selectedReview.presentationTitle}
                    </h2>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--text-soft)]">
                      <span>
                        {selectedReviewSessionRow
                          ? `${formatShortDate(selectedReviewSessionRow.session.startsAt)} - ${formatTime(selectedReviewSessionRow.session.startsAt)}`
                          : formatShortDate(selectedReview.createdAt)}
                      </span>
                      {selectedReviewSessionRow?.session.assignedAmbassadorName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="h-4 w-4 text-[color:var(--navy)]" />
                          {selectedReviewSessionRow.session.assignedAmbassadorName}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="grid justify-items-start gap-1 lg:justify-items-center">
                  <ReviewRatingStars rating={selectedReview.rating ?? 0} />
                  {selectedReview.rating ? (
                    <p className="text-sm font-semibold text-[color:var(--navy)]">
                      {selectedReview.rating} / 5
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 px-5 py-5">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--green)]">
                  Feedback
                </p>
                <p className="mt-3 text-base italic leading-8 text-[color:var(--navy)]">
                  &ldquo;{selectedReview.quote}&rdquo;
                </p>
              </div>
            </Card>
          ) : (
            <Card className="rounded-[28px]">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                Submission not found
              </h2>
              <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
                We couldn&apos;t find that feedback submission for this school account.
              </p>
              <ButtonLink href="/school/reviews" variant="secondary" className="mt-5">
                Back to reviews
              </ButtonLink>
            </Card>
          )
        ) : null}

        {/*
                {completedRows.map((row) => (
                  <div
                    key={row.session.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4"
                  >
                    <div>
                      <p className="font-semibold text-[color:var(--navy)]">
                        {row.session.presentationTitle}
                      </p>
                      <p className="mt-0.5 text-sm text-[color:var(--text-soft)]">
                        {formatShortDate(row.session.startsAt)} ·{" "}
                        {formatTime(row.session.startsAt)}
                        {row.session.assignedAmbassadorName
                          ? ` · ${row.session.assignedAmbassadorName}`
                          : ""}
                      </p>
                    </div>
                    {row.hasReview ? (
                      <span className="inline-flex items-center gap-2 rounded-full bg-[#eaf8ee] px-3.5 py-1.5 text-sm font-semibold text-[#117a2e]">
                        <CircleCheck className="h-4 w-4" />
                        Feedback submitted
                      </span>
                    ) : (
                      <ButtonLink
                        href={`/school/review/${row.session.id}`}
                        className="min-h-[40px] rounded-[13px] px-4"
                      >
                        <Star className="h-4 w-4" />
                        Leave feedback
                      </ButtonLink>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {portal.myReviews.length > 0 ? (
              <Card className="rounded-[28px]">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                  Feedback you&apos;ve shared
                </h2>
                <div className="mt-4 grid gap-3">
                  {portal.myReviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-[18px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-[color:var(--navy)]">
                          {review.presentationTitle}
                        </p>
                        {review.rating ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#b7822c]">
                            <Star className="h-4 w-4 fill-current" />
                            {review.rating}/5
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
                        &ldquo;{review.quote}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        ) : null}
        */}

        {route === "profile" ? (
          portal.school ? (
            <Card className="rounded-[28px]">
              <div className="flex flex-wrap items-center gap-5">
                {portal.school.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={portal.school.logoUrl}
                    alt={`${portal.school.name} logo`}
                    className="h-20 w-20 rounded-[20px] border border-[color:var(--border-soft)] bg-white object-cover"
                  />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#eef2f8,#eaf8ee)] text-2xl font-bold text-[color:var(--navy)]">
                    {portal.school.name
                      .split(" ")
                      .slice(0, 2)
                      .map((word) => word[0])
                      .join("")}
                  </span>
                )}
                <div>
                  <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                    {portal.school.name}
                  </h2>
                  <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                    Keep your school details up to date — the NZ Esports team sees these on
                    your school record.
                  </p>
                </div>
              </div>

              <form action={saveSchoolProfileAction} className="mt-7 grid gap-6">
                <ProfileSection title="School logo">
                  <SchoolLogoUploader
                    currentLogoUrl={portal.school.logoUrl}
                    schoolName={portal.school.name}
                  />
                </ProfileSection>

                <ProfileSection title="School details">
                  <div className="grid gap-4 md:grid-cols-2">
                    <ProfileField label="School name">
                      <Input name="name" defaultValue={portal.school.name} required />
                    </ProfileField>
                    <ProfileField label="Street address">
                      <Input name="address" defaultValue={portal.school.address} />
                    </ProfileField>
                    <ProfileField label="Suburb">
                      <Input name="suburb" defaultValue={portal.school.suburb} />
                    </ProfileField>
                    <ProfileField label="City / town">
                      <Input name="city" defaultValue={portal.school.city} />
                    </ProfileField>
                    <ProfileField label="Postcode">
                      <Input name="postcode" defaultValue={portal.school.postcode} />
                    </ProfileField>
                  </div>
                </ProfileSection>

                <ProfileSection
                  title="Contact details"
                  hint="Used by the NZ Esports team to reach you about bookings. Changing the contact email here doesn't change the email you log in with."
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <ProfileField label="Contact name">
                      <Input name="contactName" defaultValue={portal.school.contactName} required />
                    </ProfileField>
                    <ProfileField label="Contact email">
                      <Input
                        name="contactEmail"
                        type="email"
                        defaultValue={portal.school.contactEmail}
                        required
                      />
                    </ProfileField>
                    <ProfileField label="Phone number">
                      <Input name="contactPhone" defaultValue={portal.school.contactPhone} />
                    </ProfileField>
                  </div>
                </ProfileSection>

                <ProfileSection
                  title="Notes for the NZ Esports team"
                  hint="Availability windows, best days for assemblies, site access instructions — anything that helps us plan visits."
                >
                  <Textarea
                    name="profileNotes"
                    maxLength={2000}
                    defaultValue={portal.school.profileNotes ?? ""}
                    placeholder="e.g. Assemblies run Tuesday and Thursday mornings. Sign in at the main office on Smith St."
                    className="min-h-28"
                  />
                </ProfileSection>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    className="min-h-[46px] rounded-[14px] border-[#149238] bg-[color:var(--green)] px-6 text-white hover:border-[#0f7c2e] hover:bg-[#128a30]"
                  >
                    Save profile
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card className="rounded-[28px]">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                No school linked yet
              </h2>
              <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
                Your account isn&apos;t linked to a school record. Contact the NZ Esports team
                at schools@esf.nz and we&apos;ll connect it.
              </p>
            </Card>
          )
        ) : null}

        {route.startsWith("review/") ? (
          reviewSessionRow && reviewSessionRow.hasReview ? (
            <Card className="rounded-[28px]">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                Feedback already submitted
              </h2>
              <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
                Thanks — you&apos;ve already shared feedback for this session.
              </p>
              <ButtonLink href="/school/reviews" variant="secondary" className="mt-5">
                Back to reviews
              </ButtonLink>
            </Card>
          ) : (
            <SchoolFeedbackForm
              action={submitSchoolReviewAction}
              sessionId={slug?.[1] ?? ""}
              returnTo="/school/reviews"
              schoolName={schoolName}
              defaultName={actor.fullName}
              presentationTitle={reviewSessionRow?.session.presentationTitle}
              startsAt={reviewSessionRow?.session.startsAt}
              ambassadorName={reviewSessionRow?.session.assignedAmbassadorName}
            />
          )
        ) : null}
      </DashboardShell>
    </main>
  );
}

function SchoolStatTile({
  icon,
  iconClassName,
  label,
  value,
  hint
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]",
            iconClassName
          )}
        >
          {icon}
        </span>
        <div>
          <p className="text-sm text-[color:var(--text-soft)]">{label}</p>
          <p className="text-3xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
            {value}
          </p>
        </div>
      </div>
      {hint ? <p className="mt-3 text-xs text-[color:var(--text-soft)]">{hint}</p> : null}
    </div>
  );
}

function ReviewMetricTile({
  icon,
  iconClassName,
  value,
  label,
  hint
}: {
  icon: ReactNode;
  iconClassName: string;
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-6">
      <div className="flex items-center gap-5">
        <span
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-full",
            iconClassName
          )}
        >
          {icon}
        </span>
        <div>
          <p className="text-4xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
            {value}
          </p>
          <p className="mt-1 font-semibold text-[color:var(--navy)]">{label}</p>
          <p className="mt-1 text-sm text-[color:var(--text-soft)]">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function ReviewPanelHeading({
  icon,
  iconClassName,
  title,
  hint
}: {
  icon: ReactNode;
  iconClassName: string;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
          iconClassName
        )}
      >
        {icon}
      </span>
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">{hint}</p>
      </div>
    </div>
  );
}

function ReviewRatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[#d89413]">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn("h-4 w-4", index < Math.round(rating) ? "fill-current" : "")}
        />
      ))}
    </span>
  );
}

function QuickAction({
  href,
  icon,
  label
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <ButtonLink
      href={href}
      variant="secondary"
      className="min-h-[52px] justify-between rounded-[16px] px-4 text-left text-sm"
    >
      <span className="flex items-center gap-2.5">
        {icon}
        {label}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
    </ButtonLink>
  );
}

function SchoolContactCallout({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-[rgba(24,168,59,0.14)] bg-[linear-gradient(135deg,#f2fbf5,#f8fcff)] px-6 py-7 shadow-[0_18px_44px_rgba(11,24,77,0.06)] md:flex md:items-center md:justify-between md:gap-8 md:px-8",
        className
      )}
    >
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Support
        </p>
        <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.03em] text-[color:var(--navy)]">
          Have any questions?
        </h2>
        <p className="mt-3 text-base leading-7 text-[color:var(--text-soft)]">
          Reach out to our team and we&apos;ll help with bookings, scheduling, or presentation
          details.
        </p>
      </div>
      <ButtonLink
        href="mailto:schools@esf.nz"
        className="mt-5 min-h-[50px] min-w-[144px] whitespace-nowrap rounded-[16px] border-[#149238] bg-[color:var(--green)] px-6 text-white shadow-[0_14px_32px_rgba(24,168,59,0.22)] hover:border-[#0f7c2e] hover:bg-[#128a30] md:mt-0"
      >
        <Mail className="h-4 w-4" />
        Contact us
      </ButtonLink>
    </section>
  );
}

function ProfileSection({
  title,
  hint,
  children
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
        {title}
      </h3>
      {hint ? <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ProfileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function getSchoolNotice(searchParams: Record<string, string | string[] | undefined>) {
  const requested = readSearchParam(searchParams, "requested");
  const submitted = readSearchParam(searchParams, "submitted");
  const saved = readSearchParam(searchParams, "saved");
  const error = readSearchParam(searchParams, "error");

  if (saved === "profile") {
    return "Profile saved. The NZ Esports team can see your updated details.";
  }

  if (requested === "reschedule") {
    return "Reschedule request sent. Staff will review availability and follow up.";
  }

  if (requested === "cancel") {
    return "Cancellation request sent. Staff will confirm the next step with you.";
  }

  if (submitted === "review") {
    return "Thanks, your feedback has been sent to the NZ Esports team.";
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
