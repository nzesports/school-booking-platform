import type { ReactNode } from "react";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  MessageSquareText,
  School2,
  Settings,
  UsersRound
} from "lucide-react";

import { logoutAction } from "@/app/auth/actions";
import {
  markNotificationReadAction,
  markReportReviewedAction,
  reviewAmbassadorAction,
  savePlatformSettingsAction,
  saveResourceAction
} from "@/app/portal/actions";
import { OperationsAnalytics } from "@/components/dashboard/operations-analytics";
import {
  BookingLifecyclePanel,
  FeedbackWorkspace,
  SchoolDeliveryDatabase
} from "@/components/dashboard/operations-views";
import {
  PaymentsWorkspace,
  getPaymentsNotice
} from "@/components/dashboard/payments-workspace";
import { ReportDetailsButton } from "@/components/dashboard/report-details-dialog";
import { ReportsOverview } from "@/components/dashboard/reports-overview";
import { ResourcesWorkspace } from "@/components/dashboard/resources-workspace";
import { SettingsWorkspace } from "@/components/dashboard/settings-workspace";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { requirePortalAccess } from "@/lib/services/auth";
import {
  buildFilteredDashboardData,
  dashboardRangeLabel,
  dashboardRangeOptions,
  readBookingLifecycleView,
  readDashboardRange
} from "@/lib/services/dashboard-insights";
import { getPaymentSettings } from "@/lib/services/invoices";
import { getStaffPortalData } from "@/lib/services/portal";
import {
  cn,
  formatCurrency,
  formatDateTime,
  formatTime,
  formatWeekdayDate,
  titleCase
} from "@/lib/utils";

const navItems = [
  { href: "/staff", label: "Dashboard", icon: ClipboardCheck },
  { href: "/staff/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/staff/schools", label: "Schools", icon: School2 },
  { href: "/staff/ambassadors", label: "Ambassadors", icon: UsersRound },
  { href: "/staff/reports", label: "Reports", icon: ClipboardCheck },
  { href: "/staff/payments", label: "Payments", icon: CircleDollarSign },
  { href: "/staff/feedback", label: "Feedback", icon: MessageSquareText },
  { href: "/staff/resources", label: "Resources", icon: FolderKanban },
  { href: "/staff/settings", label: "Settings", icon: Settings }
];

export default async function StaffPortalPage({
  params,
  searchParams
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const route = slug?.join("/") ?? "";
  const actor = await requirePortalAccess("staff");
  const portal = await getStaffPortalData(actor.id);
  const dashboardRange = readDashboardRange(resolvedSearchParams.range);
  const activeBookingView = readBookingLifecycleView(resolvedSearchParams.status);
  const filteredDashboard = buildFilteredDashboardData(
    portal.bookings,
    portal.reports,
    portal.ambassadors,
    portal.schoolReviews,
    dashboardRange,
    portal.activityLogs
  );
  const isCreatingResource = route === "resources/new";
  const selectedResource =
    route.startsWith("resources/") && !isCreatingResource
      ? portal.resources.find((resource) => resource.id === route.replace("resources/", ""))
      : null;
  const resourceEditor = isCreatingResource
    ? {
        id: "",
        title: "",
        description: "",
        type: "pdf",
        audience: "school" as const,
        audiences: ["school" as const],
        tags: [],
        presentationTypeId: "",
        presentationSlug: undefined,
        presentationTitle: undefined,
        storagePath: undefined,
        externalUrl: "",
        youtubeUrl: "",
        downloadUrl: undefined,
        embedUrl: undefined,
        versionLabel: "",
        isCurrent: true,
        isActive: true
      }
    : selectedResource;
  const selectedAmbassador = route.startsWith("ambassadors/")
    ? portal.ambassadors.find((ambassador) => ambassador.id === route.replace("ambassadors/", ""))
    : null;
  const resourceNotice = getStaffContentNotice(resolvedSearchParams);
  const paymentSettings = route === "payments" ? await getPaymentSettings() : null;

  const headline =
    route === ""
      ? `Good morning, ${actor.fullName.split(" ")[0]}`
      : route === "bookings"
        ? "Manage booking requests and session follow-up"
        : route === "calendar"
          ? "Track the live presentation schedule"
          : route === "schools"
            ? "Review schools, regions, and rollout readiness"
            : route === "ambassadors"
              ? "Review ambassador applications and availability"
              : route.startsWith("ambassadors/")
                ? "Review ambassador application"
                : route === "reports"
                  ? "Stay on top of submitted reports"
                  : route === "payments"
                    ? "Track ambassador invoices and payments"
                  : route === "feedback"
                    ? "Monitor school feedback and report quality"
                    : route === "resources"
                      ? "Manage school and ambassador resources"
                      : route === "resources/new"
                        ? "Create a new resource"
                        : route.startsWith("resources/")
                          ? "Edit resource content"
                      : route === "settings"
                        ? "Platform settings"
                        : route === "activity"
                          ? "Unread activity and approval notifications"
                          : "Staff operations workspace";

  return (
    <main className="min-h-screen">
      <DashboardShell
        title="Staff Portal"
        role="staff"
        navItems={navItems}
        currentPath={`/staff${route ? `/${route}` : ""}`}
        headline={headline}
        subheadline="Here’s what needs attention today across bookings, ambassador management, reporting, feedback, and resource operations."
        dateLabel={dashboardRangeLabel(dashboardRange)}
        rangeOptions={dashboardRangeOptions.map((option) => ({
          ...option,
          href: `/staff${route ? `/${route}` : ""}?range=${option.value}`
        }))}
        activeRange={dashboardRange}
        activityHref="/staff/activity"
        notificationCount={actor.notificationCount}
        notifications={portal.notifications}
        markNotificationReadAction={markNotificationReadAction}
        logoutAction={logoutAction}
        profile={{
          name: actor.fullName,
          subtitle: actor.role === "super_admin" ? "Super Admin on staff view" : "Operations Team"
        }}
      >
        {route === "" ? (
          <OperationsAnalytics
            basePath="/staff"
            range={dashboardRange}
            periodLabel={dashboardRangeLabel(dashboardRange)}
            bookings={portal.bookings}
            reports={portal.reports}
            schoolReviews={portal.schoolReviews}
            ambassadors={portal.ambassadors}
            payments={portal.payments}
            schools={portal.schools}
            presentations={portal.presentations}
            regions={portal.regions}
            resourcesLiveCount={portal.resources.filter((resource) => resource.isActive).length}
            unreadActivityCount={
              portal.notifications.filter((notification) => !notification.readAt).length
            }
            presentationsHref="/#presentations"
            calendarHref="/staff/bookings"
          />
        ) : null}

        {route === "bookings" ? (
          <BookingLifecyclePanel
            basePath="/staff"
            bookings={filteredDashboard.bookings}
            schools={portal.schools}
            presentations={portal.presentations}
            ambassadors={portal.ambassadors}
            activeView={activeBookingView}
            range={dashboardRange}
            initialQuery={readSearchParam(resolvedSearchParams, "q")}
            initialBookingId={readSearchParam(resolvedSearchParams, "booking")}
          />
        ) : null}

        {route === "calendar" ? (
          <DataTable
            title="Upcoming presentation calendar"
            columns={["Date", "Time", "Presentation", "School", "Region", "Ambassador"]}
            rows={portal.upcomingSessions.map((session) => [
              formatWeekdayDate(session.startsAt),
              formatTime(session.startsAt),
              session.presentationTitle,
              session.schoolName,
              session.regionSlug,
              session.assignedAmbassadorName ?? "Unassigned"
            ])}
          />
        ) : null}

        {route === "schools" ? (
          <SchoolDeliveryDatabase
            schools={portal.schools}
            bookings={portal.bookings}
            regions={portal.regions}
            basePath="/staff"
          />
        ) : null}

        {route === "ambassadors" ? (
          <DataTable
            title="Ambassador pipeline"
            columns={["Name", "Region", "Travel", "Pending payout", "Status", "Action"]}
            rows={portal.ambassadors.map((ambassador) => [
              ambassador.name,
              ambassador.regionSlug,
              ambassador.openToTravel
                ? ambassador.travelRegions.length > 0
                  ? ambassador.travelRegions.join(", ")
                  : "Open to travel"
                : "Local only",
              ambassador.pendingPaymentsCents > 0
                ? formatCurrency(ambassador.pendingPaymentsCents)
                : "—",
              <StatusBadge
                key={`${ambassador.id}-status`}
                value={
                  ambassador.status === "approved"
                    ? "confirmed"
                    : ambassador.status === "declined"
                      ? "declined"
                      : ambassador.status === "inactive"
                        ? "restricted"
                        : "tentative"
                }
              />,
              <ButtonLink
                key={`${ambassador.id}-action`}
                href={`/staff/ambassadors/${ambassador.id}`}
                variant="ghost"
                className="min-h-[38px] rounded-[14px] px-3 py-1.5"
              >
                Review
              </ButtonLink>
            ])}
          />
        ) : null}

        {selectedAmbassador ? (
          <div className="grid gap-5">
            <div>
              <ButtonLink
                href="/staff/ambassadors"
                variant="ghost"
                className="min-h-[42px] rounded-[14px] px-4 py-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to ambassadors
              </ButtonLink>
            </div>
            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="rounded-[34px]">
              <SectionHeading kicker="Application profile" title={selectedAmbassador.name} />
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <InfoBlock label="Status" value={titleCase(selectedAmbassador.status)} />
                <InfoBlock label="Primary region" value={selectedAmbassador.regionSlug} />
                <InfoBlock label="Email" value={selectedAmbassador.email} />
                <InfoBlock
                  label="Referred by"
                  value={selectedAmbassador.referredBy ?? "Not provided"}
                />
                <InfoBlock
                  label="Travel regions"
                  value={
                    selectedAmbassador.travelRegions.length > 0
                      ? selectedAmbassador.travelRegions.join(", ")
                      : selectedAmbassador.openToTravel
                        ? "Open to travel"
                        : "Local only"
                  }
                />
                <InfoBlock
                  label="Payments"
                  value={`${formatCurrency(selectedAmbassador.paidPaymentsCents)} paid · ${formatCurrency(selectedAmbassador.pendingPaymentsCents)} pending`}
                />
              </div>
              <div className="mt-6 rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Experience
                </p>
                <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                  {selectedAmbassador.experience ??
                    "The application details are captured in the ambassador profile and can be expanded further as interviews are completed."}
                </p>
              </div>
            </Card>

            {selectedAmbassador.status === "approved" || selectedAmbassador.status === "inactive" ? (
              <Card className="rounded-[34px]">
                <SectionHeading kicker="Staff decision" title="Manage ambassador access" />
                <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                  {selectedAmbassador.status === "approved"
                    ? "This ambassador is approved and active. You can temporarily restrict their platform access or remove them from the ambassador programme."
                    : "This ambassador's access is temporarily restricted. Restore their access when they are ready to present again, or remove them from the programme."}
                </p>
                <div className="mt-6 grid gap-4">
                  {selectedAmbassador.status === "approved" ? (
                    <form action={reviewAmbassadorAction}>
                      <input type="hidden" name="ambassadorProfileId" value={selectedAmbassador.id} />
                      <input type="hidden" name="status" value="inactive" />
                      <input type="hidden" name="returnTo" value={`/staff/ambassadors/${selectedAmbassador.id}`} />
                      <button
                        type="submit"
                        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[18px] border border-[#f0d8a8] bg-[#fdf3dc] px-5 py-2.5 text-sm font-semibold text-[#9a5a00] shadow-[0_10px_24px_rgba(154,90,0,0.1)]"
                      >
                        Temporarily restrict access
                      </button>
                    </form>
                  ) : (
                    <form action={reviewAmbassadorAction}>
                      <input type="hidden" name="ambassadorProfileId" value={selectedAmbassador.id} />
                      <input type="hidden" name="status" value="approved" />
                      <input type="hidden" name="returnTo" value={`/staff/ambassadors/${selectedAmbassador.id}`} />
                      <button
                        type="submit"
                        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)]"
                      >
                        Restore access
                      </button>
                    </form>
                  )}
                  <form action={reviewAmbassadorAction}>
                    <input type="hidden" name="ambassadorProfileId" value={selectedAmbassador.id} />
                    <input type="hidden" name="status" value="declined" />
                    <input type="hidden" name="returnTo" value={`/staff/ambassadors/${selectedAmbassador.id}`} />
                    <button
                      type="submit"
                      className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[18px] border border-[#f3b4b4] bg-[#fff6f6] px-5 py-2.5 text-sm font-semibold text-[#9d2424] shadow-[0_10px_24px_rgba(157,36,36,0.1)]"
                    >
                      Remove ambassador
                    </button>
                  </form>
                </div>
              </Card>
            ) : (
              <Card className="rounded-[34px]">
                <SectionHeading kicker="Staff decision" title="Approve or decline access" />
                <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                  Approving this application unlocks ambassador portal access. Declining keeps the
                  account out of the ambassador portal until staff revisits the application.
                </p>
                <div className="mt-6 grid gap-4">
                  <form action={reviewAmbassadorAction}>
                    <input type="hidden" name="ambassadorProfileId" value={selectedAmbassador.id} />
                    <input type="hidden" name="status" value="approved" />
                    <input type="hidden" name="returnTo" value={`/staff/ambassadors/${selectedAmbassador.id}`} />
                    <button
                      type="submit"
                      className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)]"
                    >
                      Approve ambassador
                    </button>
                  </form>
                  <form action={reviewAmbassadorAction}>
                    <input type="hidden" name="ambassadorProfileId" value={selectedAmbassador.id} />
                    <input type="hidden" name="status" value="declined" />
                    <input type="hidden" name="returnTo" value={`/staff/ambassadors/${selectedAmbassador.id}`} />
                    <button
                      type="submit"
                      className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[18px] border border-[#f3b4b4] bg-[#fff6f6] px-5 py-2.5 text-sm font-semibold text-[#9d2424] shadow-[0_10px_24px_rgba(157,36,36,0.1)]"
                    >
                      Decline application
                    </button>
                  </form>
                </div>
              </Card>
            )}
            </div>
          </div>
        ) : null}

        {route === "reports" ? (
          <div className="grid gap-5">
            <ReportsOverview reports={portal.reports} />
            <div id="session-reports" className="scroll-mt-24">
              <DataTable
                title="Session reports"
                columns={["School", "Presentation", "Submitted", "Attendees", "Status", "Report"]}
                rows={portal.reports.map((report) => [
                  report.schoolName,
                  report.presentationTitle,
                  formatDateTime(report.submittedAt),
                  String(report.attendeeCount),
                  <StatusBadge key={`${report.id}-status`} value={report.status} />,
                  <ReportDetailsButton
                    key={`${report.id}-view`}
                    report={report}
                    reviewAction={markReportReviewedAction}
                    reviewReturnTo="/staff/reports#session-reports"
                  />
                ])}
              />
            </div>
          </div>
        ) : null}

        {route === "payments" ? (
          <PaymentsWorkspace
            basePath="/staff"
            payments={portal.payments}
            sessions={portal.bookings.flatMap((booking) => booking.sessions)}
            financeEmail={paymentSettings?.financeEmail ?? "info@esf.nz"}
            notice={getPaymentsNotice(resolvedSearchParams)}
          />
        ) : null}

        {route === "feedback" ? (
          <FeedbackWorkspace
            reports={filteredDashboard.reports}
            schoolReviews={filteredDashboard.schoolReviews}
            returnTo="/staff/feedback"
          />
        ) : null}

        {route === "resources" ? (
          <div className="grid gap-4">
            {resourceNotice ? (
              <NoticeBanner tone={resourceNotice.tone}>{resourceNotice.message}</NoticeBanner>
            ) : null}
            <ResourcesWorkspace
              resources={portal.resources}
              presentations={portal.presentations.map((presentation) => ({
                id: presentation.id,
                title: presentation.title
              }))}
              action={saveResourceAction}
              returnTo="/staff/resources"
            />
          </div>
        ) : null}

        {resourceEditor && (selectedResource || isCreatingResource) ? (
          <Card className="overflow-hidden rounded-[38px] p-0">
            <div className="border-b border-[color:rgba(4,15,75,0.08)] px-6 py-6 md:px-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
                Resource management
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                    {isCreatingResource ? "Create Resource" : "Edit Resource"}
                  </h2>
                  <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                    Upload files, attach videos, link resources to presentations, and control who can
                    access them.
                  </p>
                </div>
                <ButtonLink href="/staff/resources" variant="secondary">
                  Back to resources
                </ButtonLink>
              </div>
              <div className="mt-6 flex flex-wrap gap-6 border-b border-[color:rgba(4,15,75,0.06)] pb-1">
                {[
                  ["Details", "#resource-details"],
                  ["Access", "#resource-access"],
                  ["Media", "#resource-media"],
                  ["Downloads", "#resource-downloads"],
                  ["Settings", "#resource-settings"]
                ].map(([tab, href]) => (
                  <a
                    key={tab}
                    href={href}
                    className={`inline-flex border-b-2 px-1 pb-3 text-sm font-semibold transition hover:text-[color:var(--navy)] ${
                      tab === "Details"
                        ? "border-[color:var(--green)] text-[color:var(--navy)]"
                        : "border-transparent text-[color:var(--text-soft)]"
                    }`}
                  >
                    {tab}
                  </a>
                ))}
              </div>
            </div>

            {resourceNotice ? (
              <NoticeBanner tone={resourceNotice.tone} className="mx-6 mt-6 md:mx-8">
                {resourceNotice.message}
              </NoticeBanner>
            ) : null}

            <form
              action={saveResourceAction}
              encType="multipart/form-data"
              className="grid gap-8 px-6 py-8 md:px-8 xl:grid-cols-[minmax(0,1fr)_320px]"
            >
              {resourceEditor.id ? <input type="hidden" name="id" value={resourceEditor.id} /> : null}
              <input
                type="hidden"
                name="returnTo"
                value={isCreatingResource ? "/staff/resources/new" : `/staff/resources/${resourceEditor.id}`}
              />

              <div id="resource-details" className="grid scroll-mt-8 gap-6">
                <Field label="Title *">
                  <input
                    name="title"
                    required
                    defaultValue={resourceEditor.title}
                    className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm text-[color:var(--text-dark)]"
                  />
                </Field>

                <Field label="Description">
                  <textarea
                    name="description"
                    defaultValue={resourceEditor.description}
                    className="min-h-[8rem] w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm leading-7 text-[color:var(--text-dark)]"
                  />
                </Field>

                <div id="resource-access" className="grid scroll-mt-8 gap-4 lg:grid-cols-2">
                  <Field label="Audiences">
                    <div className="grid gap-2 rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm">
                      {[
                        ["school", "Schools"],
                        ["ambassador", "Ambassadors"],
                        ["staff", "Staff"]
                      ].map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2 text-[color:var(--navy)]">
                          <input
                            type="checkbox"
                            name="audiences"
                            value={value}
                            defaultChecked={resourceEditor.audiences.includes(
                              value as "school" | "ambassador" | "staff"
                            )}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field label="Resource type">
                    <select
                      name="resourceType"
                      defaultValue={resourceEditor.type}
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    >
                      <option value="pdf">PDF</option>
                      <option value="pptx">PPTX</option>
                      <option value="script">Script</option>
                      <option value="image">Image</option>
                      <option value="youtube">YouTube</option>
                      <option value="file">Downloadable file</option>
                    </select>
                  </Field>
                </div>

                <Field label="Tags">
                  <p className="text-xs text-[color:var(--text-soft)]">
                    Comma separated, e.g. wellbeing, parents, year-9
                  </p>
                  <input
                    name="tags"
                    defaultValue={resourceEditor.tags.join(", ")}
                    className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                  />
                </Field>

                <Field label="Presentation link">
                  <select
                    name="presentationTypeId"
                    defaultValue={resourceEditor.presentationTypeId ?? ""}
                    className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                  >
                    <option value="">General resource</option>
                    {portal.presentations.map((presentation) => (
                      <option key={presentation.id} value={presentation.id}>
                        {presentation.title}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Version label">
                    <input
                      name="versionLabel"
                      defaultValue={resourceEditor.versionLabel ?? ""}
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                      placeholder="v2026.06"
                    />
                  </Field>
                  <Field label="External download URL">
                    <input
                      name="externalUrl"
                      defaultValue={resourceEditor.externalUrl ?? ""}
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                      placeholder="Optional external file link"
                    />
                  </Field>
                </div>

                <Field label="YouTube URL">
                  <input
                    name="youtubeUrl"
                    defaultValue={resourceEditor.youtubeUrl ?? ""}
                    className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </Field>
              </div>

              <div className="grid content-start gap-5">
                <div id="resource-downloads" className="scroll-mt-8 rounded-[28px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                    Upload file
                  </p>
                  <Field label="Replace or add asset">
                    <input
                      type="file"
                      name="file"
                      accept=".pdf,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"
                      className="w-full rounded-[18px] border border-dashed border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm"
                    />
                  </Field>
                  {resourceEditor.downloadUrl ? (
                    <div className="mt-4 rounded-[20px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Current file
                      </p>
                      <ButtonLink href={resourceEditor.downloadUrl} variant="secondary" className="mt-3">
                        Download current asset
                      </ButtonLink>
                    </div>
                  ) : null}
                </div>

                <div id="resource-media" className="scroll-mt-8 rounded-[28px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                    Preview
                  </p>
                  {resourceEditor.embedUrl ? (
                    <div className="mt-4 overflow-hidden rounded-[22px] border border-[color:var(--border-soft)]">
                      <iframe
                        src={resourceEditor.embedUrl}
                        title={resourceEditor.title || "Resource preview"}
                        className="h-56 w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div className="mt-4 flex h-56 items-center justify-center rounded-[22px] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] text-sm text-[color:var(--text-soft)]">
                      Upload a file or add a YouTube link to preview this resource here.
                    </div>
                  )}
                </div>

                <div id="resource-settings" className="scroll-mt-8 rounded-[28px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                    Settings
                  </p>
                  <div className="mt-4 grid gap-3">
                    <label className="flex items-center gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-3 text-sm text-[color:var(--navy)]">
                      <input type="checkbox" name="isCurrent" defaultChecked={resourceEditor.isCurrent} />
                      Mark as current version
                    </label>
                    <label className="flex items-center gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-3 text-sm text-[color:var(--navy)]">
                      <input type="checkbox" name="isActive" defaultChecked={resourceEditor.isActive} />
                      Visible to selected audience
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:rgba(4,15,75,0.08)] pt-6 xl:col-span-2">
                <ButtonLink href="/staff/resources" variant="secondary">
                  Cancel
                </ButtonLink>
                <button
                  type="submit"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)]"
                >
                  {isCreatingResource ? "Create Resource" : "Update Resource"}
                </button>
              </div>
            </form>
          </Card>
        ) : null}

        {route === "settings" ? (
          <SettingsWorkspace
            settings={portal.settings}
            action={savePlatformSettingsAction}
            returnTo="/staff/settings"
            notice={
              readSearchParam(resolvedSearchParams, "saved") === "settings"
                ? { tone: "success", message: "Settings saved." }
                : readSearchParam(resolvedSearchParams, "error") === "invalid-settings"
                  ? { tone: "error", message: "Those settings didn't look right — please check the fields and try again." }
                  : readSearchParam(resolvedSearchParams, "error") === "settings-save-failed"
                    ? { tone: "error", message: "Saving failed — please try again." }
                    : null
            }
          />
        ) : null}

        {route === "activity" ? (
          <div className="grid gap-4">
            {portal.notifications.filter((notification) => !notification.readAt).length === 0 ? (
              <Card className="rounded-[34px]">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-[color:var(--green)]" />
                  <div>
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                      You&apos;re all caught up.
                    </h2>
                    <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                      New ambassador applications will land here for staff review.
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              portal.notifications
                .filter((notification) => !notification.readAt)
                .map((notification) => (
                <Card key={notification.id} className="rounded-[34px]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                        Activity
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                        {notification.title}
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-soft)]">
                        {notification.body}
                      </p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        {formatDateTime(notification.createdAt)}
                      </p>
                    </div>
                    <StatusBadge
                      value={notification.resolvedAt ? "confirmed" : notification.readAt ? "submitted" : "tentative"}
                    />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {notification.relatedUrl ? (
                      <ButtonLink href={notification.relatedUrl}>Open review</ButtonLink>
                    ) : null}
                    {!notification.readAt ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <input type="hidden" name="redirectTo" value="/staff/activity" />
                        <button
                          type="submit"
                          className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[color:rgba(4,15,75,0.12)] bg-white px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                        >
                          Mark as read
                        </button>
                      </form>
                    ) : null}
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : null}
      </DashboardShell>
    </main>
  );
}

function SectionHeading({
  kicker,
  title,
  actionHref,
  actionLabel
}: {
  kicker: string;
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          {kicker}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
          {title}
        </h2>
      </div>
      {actionHref && actionLabel ? (
        <ButtonLink href={actionHref} variant="ghost">
          {actionLabel}
        </ButtonLink>
      ) : null}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
        {label}
      </p>
      <p className="mt-2 text-sm leading-7 text-[color:var(--navy)]">{value}</p>
    </div>
  );
}

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getStaffContentNotice(searchParams: Record<string, string | string[] | undefined>) {
  const error = readSearchParam(searchParams, "error");
  const saved = readSearchParam(searchParams, "saved");

  if (error === "invalid-resource") {
    return {
      tone: "error" as const,
      message: "The resource details were incomplete. Review the fields and try again."
    };
  }

  if (error === "resource-upload-failed") {
    return {
      tone: "error" as const,
      message:
        "The file could not be uploaded. Check that Supabase storage admin access is configured and try again."
    };
  }

  if (error === "resource-save-failed") {
    return {
      tone: "error" as const,
      message: "The resource could not be saved. Please try again."
    };
  }

  if (saved === "resource") {
    return {
      tone: "success" as const,
      message: "Resource changes have been saved."
    };
  }

  return null;
}

function NoticeBanner({
  tone,
  children,
  className
}: {
  tone: "success" | "error";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border px-4 py-3 text-sm",
        tone === "success"
          ? "border-[#b9e2c7] bg-[#f4fbf6] text-[#1d6f35]"
          : "border-[#f2c6c6] bg-[#fff6f6] text-[#9d2424]",
        className
      )}
    >
      {children}
    </div>
  );
}

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
