import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { ReactNode } from "react";
import type { ResourceAudience } from "@/lib/domain/types";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  GraduationCap,
  MessageSquareText,
  Plus,
  School2,
  Upload,
  UsersRound
} from "lucide-react";

import { logoutAction } from "@/app/auth/actions";
import {
  connectAmbassadorPortalAccountAction,
  createTrainingPackAction,
  deleteAmbassadorRecordAction,
  deleteTrainingPackAction,
  markNotificationReadAction,
  markReportReviewedAction,
  logStaffFeedbackAction,
  reviewAmbassadorAction,
  reviewSchoolFeedbackAction,
  saveManualBookingAction,
  saveManualSchoolAction,
  savePlatformSettingsAction,
  savePortalProfileAction,
  saveResourceEditorAction,
  saveResourceAction
} from "@/app/portal/actions";
import { OperationsAnalytics } from "@/components/dashboard/operations-analytics";
import { FeedbackHub } from "@/components/dashboard/feedback-hub";
import {
  AmbassadorProfileWorkspace,
  AmbassadorsWorkspace,
  type AmbassadorProfileSection,
  type VolunteerDirectorySort,
  type VolunteerDirectoryStatus
} from "@/components/dashboard/ambassadors-workspace";
import {
  BookingLifecyclePanel,
  SchoolDeliveryDatabase
} from "@/components/dashboard/operations-views";
import {
  PaymentsWorkspace,
  getPaymentsNotice
} from "@/components/dashboard/payments-workspace";
import { PortalProfileWorkspace } from "@/components/dashboard/portal-profile-workspace";
import { ResourcesWorkspace } from "@/components/dashboard/resources-workspace";
import { SettingsWorkspace } from "@/components/dashboard/settings-workspace";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { ManualSchoolDialog } from "@/components/dashboard/manual-school-dialog";
import { ManualBookingDialog } from "@/components/dashboard/manual-booking-dialog";
import { LogFeedbackDialog } from "@/components/dashboard/log-feedback-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { requirePortalAccess } from "@/lib/services/auth";
import {
  buildFilteredDashboardData,
  dashboardRangeLabel,
  dashboardRangeOptions,
  readBookingLifecycleView,
  readDashboardCustomRange,
  readDashboardRange
} from "@/lib/services/dashboard-insights";
import { getPaymentSettings } from "@/lib/services/payment-automation";
import { getStaffPortalData } from "@/lib/services/portal";
import {
  cn,
  formatDateTime,
  formatTime,
  formatWeekdayDate
} from "@/lib/utils";

const navItems = [
  { href: "/staff", label: "Dashboard", icon: ClipboardCheck },
  { href: "/staff/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/staff/schools", label: "Schools", icon: School2 },
  { href: "/staff/feedback", label: "Feedback", icon: MessageSquareText },
  {
    href: "/staff/ambassadors",
    label: "Ambassadors",
    icon: UsersRound,
    separatorBefore: true
  },
  { href: "/staff/payments", label: "Payments", icon: CircleDollarSign },
  {
    href: "/staff/training",
    label: "Training",
    icon: GraduationCap,
    separatorBefore: true
  },
  { href: "/staff/materials", label: "Materials", icon: FolderKanban }
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

  if (route === "resources") {
    redirect("/staff/training");
  }
  const actor = await requirePortalAccess("staff");
  const portal = await getStaffPortalData(actor.id);
  const customRange = readDashboardCustomRange(
    resolvedSearchParams.from,
    resolvedSearchParams.to
  );
  const requestedDashboardRange =
    route === "bookings"
      ? "all"
      : !resolvedSearchParams.range && (route === "reports" || route === "feedback")
        ? "all"
        : !resolvedSearchParams.range && route === ""
          ? "year"
          : readDashboardRange(resolvedSearchParams.range);
  const dashboardRange =
    requestedDashboardRange === "custom" && !customRange ? "year" : requestedDashboardRange;
  const rawAnalyticsYear = Array.isArray(resolvedSearchParams.analyticsYear)
    ? resolvedSearchParams.analyticsYear[0]
    : resolvedSearchParams.analyticsYear;
  const analyticsYear = /^\d{4}$/.test(rawAnalyticsYear ?? "")
    ? Number(rawAnalyticsYear)
    : undefined;
  const activeBookingView = readBookingLifecycleView(resolvedSearchParams.status);
  const filteredDashboard = buildFilteredDashboardData(
    portal.bookings,
    portal.reports,
    portal.ambassadors,
    portal.schoolReviews,
    dashboardRange,
    portal.activityLogs,
    customRange
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
        category: "resource" as const,
        audience: "school" as const,
        audiences: ["school"] as ResourceAudience[],
        // School-audience resources are only visible to schools when sharing is
        // public, so the editor defaults to a working combination.
        sharingScope: "public" as const,
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
  const ambassadorTab =
    readSearchParam(resolvedSearchParams, "tab") === "applications"
      ? ("applications" as const)
      : ("profiles" as const);
  const volunteerDirectoryStatus: VolunteerDirectoryStatus =
    readSearchParam(resolvedSearchParams, "roster") === "inactive" ? "inactive" : "active";
  const volunteerDirectoryQuery = readSearchParam(resolvedSearchParams, "q") ?? "";
  const volunteerDirectorySort: VolunteerDirectorySort =
    readSearchParam(resolvedSearchParams, "sort") === "desc" ? "desc" : "asc";
  const ambassadorNotice = getAmbassadorNotice(resolvedSearchParams);
  const requestedAmbassadorSection = readSearchParam(resolvedSearchParams, "section");
  const ambassadorSection: AmbassadorProfileSection = [
    "overview",
    "presentations",
    "reports",
    "sourced",
    "feedback",
    "payments"
  ].includes(requestedAmbassadorSection ?? "")
    ? (requestedAmbassadorSection as AmbassadorProfileSection)
    : "overview";
  const resourceNotice = getStaffContentNotice(resolvedSearchParams);
  const reportNotice = getReportApprovalNotice(resolvedSearchParams);
  const paymentSettings = route === "payments" ? await getPaymentSettings() : null;
  const reportedSessionIds = new Set(
    portal.reports.map((report) => report.bookingSessionId).filter(Boolean)
  );
  const feedbackSessions = portal.bookings
    .flatMap((booking) => booking.sessions)
    .filter(
      (session) =>
        (session.status === "completed_pending_report" || session.status === "closed") &&
        !reportedSessionIds.has(session.id) &&
        session.reportStatus !== "submitted" &&
        session.reportStatus !== "reviewed"
    )
    .sort(
      (left, right) =>
        new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime()
    )
    .map((session) => ({
      id: session.id,
      schoolName: session.schoolName,
      presentationTitle: session.presentationTitle,
      startsAt: session.startsAt,
      yearLevels: session.yearLevels,
      attendeeCount: session.actualStudentCount ?? session.expectedStudentCount,
      contactName: session.contactName,
      contactEmail: session.contactEmail,
      assignedAmbassadorName: session.assignedAmbassadorName
    }));
  const feedbackSearchParams = new URLSearchParams({ range: dashboardRange });
  if (customRange) {
    feedbackSearchParams.set("from", customRange.from);
    feedbackSearchParams.set("to", customRange.to);
  }
  const feedbackReturnTo = `/staff/feedback?${feedbackSearchParams.toString()}`;

  const headline =
    route === ""
      ? `Good morning, ${actor.fullName.split(" ")[0]}`
      : route === "bookings"
        ? "Manage Bookings"
        : route === "calendar"
          ? "Track the live presentation schedule"
          : route === "schools"
            ? "Review Schools"
            : route === "ambassadors"
              ? "Manage ambassadors"
              : route.startsWith("ambassadors/")
                ? selectedAmbassador?.status === "applied" || selectedAmbassador?.status === "declined"
                  ? "Review ambassador application"
                  : "Ambassador profile"
                : route === "reports"
                  ? "School & ambassador feedback"
                  : route === "payments"
                    ? "Track invoices and payments"
                  : route === "feedback"
                    ? "School & ambassador feedback"
                    : route === "training"
                      ? "Build ambassador training packs"
                      : route === "materials"
                        ? "Manage public materials"
                      : route === "resources/new"
                        ? "Create a new resource"
                        : route.startsWith("resources/")
                          ? "Edit resource content"
                      : route === "settings"
                        ? "Platform settings"
                        : route === "profile"
                          ? "Your profile"
                        : route === "activity"
                          ? "Unread activity and approval notifications"
                          : "Staff portal";

  return (
    <main className="min-h-screen">
      <DashboardShell
        title="Staff Portal"
        role="staff"
        navItems={navItems}
        currentPath={`/staff${route ? `/${route}` : ""}`}
        headline={headline}
        dateLabel={
          route === "" || route === "feedback"
            ? dashboardRangeLabel(dashboardRange, customRange)
            : undefined
        }
        rangeOptions={
          route === "" || route === "feedback"
            ? dashboardRangeOptions.map((option) => ({
                ...option,
                href: `${route === "feedback" ? "/staff/feedback" : "/staff"}?range=${option.value}${route === "" && analyticsYear ? `&analyticsYear=${analyticsYear}` : ""}`
              }))
            : undefined
        }
        activeRange={route === "" || route === "feedback" ? dashboardRange : undefined}
        customRange={route === "" || route === "feedback" ? customRange : undefined}
        headerAction={
          route === "bookings" ? (
            <ManualBookingDialog
              key={readSearchParam(resolvedSearchParams, "reference") || "new-booking"}
              basePath="/staff"
              schools={portal.schools}
              regions={portal.regions}
              presentations={portal.presentations}
              ambassadors={portal.ambassadors}
              activeView={activeBookingView}
              range="all"
              action={saveManualBookingAction}
            />
          ) : route === "schools" ? (
            <ManualSchoolDialog
              regions={portal.regions
                .filter((region) => region.isActive)
                .map((region) => ({ id: region.id, name: region.name }))}
              action={saveManualSchoolAction}
              returnTo="/staff/schools"
            />
          ) : route === "feedback" ? (
            <LogFeedbackDialog
              sessions={feedbackSessions}
              schoolNames={portal.schools.map((school) => school.name).sort()}
              presentations={portal.presentations
                .filter((presentation) => presentation.active)
                .map((presentation) => ({
                  id: presentation.id,
                  title: presentation.title,
                  yearLevels: presentation.yearLevels
                }))}
              defaultPresenterName={actor.fullName}
              action={logStaffFeedbackAction}
              returnTo={feedbackReturnTo}
            />
          ) : route === "materials" ? (
            <ButtonLink
              href="/staff/materials?upload=1"
              variant="secondary"
              className="border-[#d8c8f4] bg-[#f8f5ff] text-[#6941c6] shadow-none hover:bg-[#f1edfd]"
            >
              <Upload className="h-4 w-4" />
              Upload material
            </ButtonLink>
          ) : route === "training" ? (
            <ButtonLink
              href="/staff/training?add=1"
              variant="secondary"
              className="border-[#bfe6d2] bg-[#eaf8ee] text-[#117a2e] shadow-none hover:bg-[#dff3e4]"
            >
              <Plus className="h-4 w-4" />
              Add training resource
            </ButtonLink>
          ) : undefined
        }
        activityHref="/staff/activity"
        notificationCount={
          portal.notifications.filter((notification) => !notification.readAt).length
        }
        notifications={portal.notifications}
        markNotificationReadAction={markNotificationReadAction}
        logoutAction={logoutAction}
        settingsHref="/staff/settings"
        profile={{
          name: actor.fullName,
          subtitle: actor.role === "super_admin" ? "Super Admin on staff view" : "Operations Team",
          imageUrl: actor.avatarUrl ?? null,
          imageAlt: `${actor.fullName} profile image`,
          href: "/staff/profile"
        }}
      >
        {route === "" ? (
          <OperationsAnalytics
            basePath="/staff"
            range={dashboardRange}
            customRange={customRange}
            analyticsYear={analyticsYear}
            periodLabel={dashboardRangeLabel(dashboardRange, customRange)}
            bookings={portal.bookings}
            reports={portal.reports}
            schoolReviews={portal.schoolReviews}
            ambassadors={portal.ambassadors}
            payments={portal.payments}
            schools={portal.schools}
            presentations={portal.presentations}
            resources={portal.resources}
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
          <div className="grid gap-4">
            {resourceNotice ? (
              <NoticeBanner tone={resourceNotice.tone}>{resourceNotice.message}</NoticeBanner>
            ) : null}
            <BookingLifecyclePanel
              key={portal.bookings.map((booking) => booking.id).join(",")}
              basePath="/staff"
              bookings={portal.bookings}
              presentations={portal.presentations}
              ambassadors={portal.ambassadors}
              activeView={activeBookingView}
              range="all"
              customRange={null}
              initialQuery={readSearchParam(resolvedSearchParams, "q")}
              initialBookingId={readSearchParam(resolvedSearchParams, "booking")}
            />
          </div>
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
          <div className="grid gap-4">
            {ambassadorNotice ? (
              <NoticeBanner tone={ambassadorNotice.tone}>{ambassadorNotice.message}</NoticeBanner>
            ) : null}
            <AmbassadorsWorkspace
              ambassadors={portal.ambassadors}
              bookings={portal.bookings}
              reports={portal.reports}
              schoolReviews={portal.schoolReviews}
              payments={portal.payments}
              activeTab={ambassadorTab}
              directoryStatus={volunteerDirectoryStatus}
              directoryQuery={volunteerDirectoryQuery}
              directorySort={volunteerDirectorySort}
              basePath="/staff/ambassadors"
            />
          </div>
        ) : null}

        {selectedAmbassador ? (
          <div className="grid gap-5">
            {ambassadorNotice ? (
              <NoticeBanner tone={ambassadorNotice.tone}>{ambassadorNotice.message}</NoticeBanner>
            ) : null}
            <div>
              <ButtonLink
                href={`/staff/ambassadors?tab=${
                  selectedAmbassador.status === "applied" || selectedAmbassador.status === "declined"
                    ? "applications"
                    : "profiles"
                }`}
                variant="ghost"
                className="min-h-[42px] rounded-[14px] px-4 py-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to ambassadors
              </ButtonLink>
            </div>
            <AmbassadorProfileWorkspace
              ambassador={selectedAmbassador}
              bookings={portal.bookings}
              reports={portal.reports}
              schoolReviews={portal.schoolReviews}
              payments={portal.payments}
              basePath="/staff/ambassadors"
              activeSection={ambassadorSection}
              reviewAction={reviewAmbassadorAction}
              connectAction={connectAmbassadorPortalAccountAction}
              deleteAction={deleteAmbassadorRecordAction}
            />
          </div>
        ) : null}

        {route === "reports" || route === "feedback" ? (
          <div className="grid gap-4">
            {reportNotice ? (
              <NoticeBanner tone={reportNotice.tone}>{reportNotice.message}</NoticeBanner>
            ) : null}
            <FeedbackHub
              reports={filteredDashboard.reports}
              schoolReviews={filteredDashboard.schoolReviews}
              reviewAction={markReportReviewedAction}
              feedbackDecisionAction={reviewSchoolFeedbackAction}
              returnTo={feedbackReturnTo}
              reportsReturnTo="/staff/reports"
              initialTab={route === "reports" ? "ambassador" : "school"}
            />
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


        {route === "training" ? (
          <div className="grid gap-4">
            {resourceNotice ? (
              <NoticeBanner tone={resourceNotice.tone}>{resourceNotice.message}</NoticeBanner>
            ) : null}
            <ResourcesWorkspace
              key={readSearchParam(resolvedSearchParams, "add") === "1" ? "training-editor-open" : "training-editor-closed"}
              resources={portal.resources.filter((resource) => resource.category === "training")}
              presentations={portal.presentations.map((presentation) => ({
                id: presentation.id,
                title: presentation.title
              }))}
              packs={portal.trainingPacks}
              action={saveResourceEditorAction}
              createPackAction={createTrainingPackAction}
              deletePackAction={deleteTrainingPackAction}
              returnTo="/staff/training"
              mode="training"
              initialTrainingView={
                readSearchParam(resolvedSearchParams, "view") === "general" ? "general" : "packs"
              }
              initialTrainingPackId={readSearchParam(resolvedSearchParams, "pack")}
              initialEditorOpen={readSearchParam(resolvedSearchParams, "add") === "1"}
            />
          </div>
        ) : null}

        {route === "materials" ? (
          <div className="grid gap-4">
            {resourceNotice ? (
              <NoticeBanner tone={resourceNotice.tone}>{resourceNotice.message}</NoticeBanner>
            ) : null}
            <ResourcesWorkspace
              key={readSearchParam(resolvedSearchParams, "upload") === "1" ? "materials-editor-open" : "materials-editor-closed"}
              resources={portal.resources.filter(
                (resource) => resource.category === "presentation_material"
              )}
              presentations={portal.presentations.map((presentation) => ({
                id: presentation.id,
                title: presentation.title
              }))}
              action={saveResourceEditorAction}
              returnTo="/staff/materials"
              mode="materials"
              initialEditorOpen={readSearchParam(resolvedSearchParams, "upload") === "1"}
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
                        ["public", "Public website"],
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
                              value as "public" | "school" | "ambassador" | "staff"
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
                      <option value="link">External link</option>
                      <option value="file">Downloadable file</option>
                    </select>
                  </Field>
                  <div className="lg:col-span-2">
                    <Field label="Sharing permission">
                      <div className="grid gap-2 rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm sm:grid-cols-2">
                        {[
                          ["internal", "Internal", "NZ Esports use only. Not visible to schools."],
                          ["public", "Public", "Approved to share with schools and the public site."]
                        ].map(([value, label, detail]) => (
                          <label key={value} className="flex items-start gap-2 text-[color:var(--navy)]">
                            <input
                              type="radio"
                              name="sharingScope"
                              value={value}
                              defaultChecked={resourceEditor.sharingScope === value}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="block font-semibold">{label}</span>
                              <span className="mt-0.5 block text-xs font-normal text-[color:var(--text-soft)]">
                                {detail}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs leading-5 text-[color:var(--text-soft)]">
                        Public sharing is required for Schools to see this resource — internal
                        resources stay hidden from school portals even when Schools is ticked.
                      </p>
                    </Field>
                  </div>
                </div>

                <Field label="Shows under">
                  <select
                    name="category"
                    defaultValue={resourceEditor.category}
                    className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                  >
                    <option value="resource">Resources — general reference material</option>
                    <option value="training">Training — ambassador learning material</option>
                    <option value="presentation_material">
                      Presentation materials — ambassador session files
                    </option>
                  </select>
                </Field>

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

                <Field label="Linked presentation">
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
                  <p className="text-xs leading-5 text-[color:var(--text-soft)]">
                    Linked ambassador resources are automatically included in the Materials tab.
                  </p>
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
                      <ButtonLink
                        href={resourceEditor.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="secondary"
                        className="mt-3"
                      >
                        Open current asset
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
                    {[
                      ["published", "Published", "Visible to selected audiences"],
                      ["draft", "Draft", "Staff and Super Admin only"],
                      ["archived", "Archived", "Staff and Super Admin only"]
                    ].map(([value, label, detail]) => (
                      <label key={value} className="flex items-start gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-3 text-sm text-[color:var(--navy)]">
                        <input
                          type="radio"
                          name="lifecycle"
                          value={value}
                          defaultChecked={
                            value === (!resourceEditor.isActive ? "draft" : resourceEditor.isCurrent ? "published" : "archived")
                          }
                        />
                        <span><span className="block font-semibold">{label}</span><span className="mt-0.5 block text-xs text-[color:var(--text-soft)]">{detail}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:rgba(4,15,75,0.08)] pt-6 xl:col-span-2">
                <ButtonLink href="/staff/resources" variant="secondary">
                  Cancel
                </ButtonLink>
                <PendingSubmitButton unstyled
                  type="submit"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)]"
                >
                  {isCreatingResource ? "Create Resource" : "Update Resource"}
                </PendingSubmitButton>
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

        {route === "profile" ? (
          <PortalProfileWorkspace
            name={actor.fullName}
            email={actor.email}
            phone={actor.phone}
            avatarUrl={actor.avatarUrl}
            roleLabel={actor.role === "super_admin" ? "Super admin" : "Staff profile"}
            returnTo="/staff/profile"
            action={savePortalProfileAction}
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
                        <PendingSubmitButton unstyled
                          type="submit"
                          className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[color:rgba(4,15,75,0.12)] bg-white px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                        >
                          Mark as read
                        </PendingSubmitButton>
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

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getReportApprovalNotice(searchParams: Record<string, string | string[] | undefined>) {
  if (readSearchParam(searchParams, "approved") === "report") {
    return readSearchParam(searchParams, "financeEmail") === "failed"
      ? {
          tone: "error" as const,
          message: "Report approved and the invoice number is safe, but the finance email failed. Retry it from Payments."
        }
      : { tone: "success" as const, message: "Report approved and sent to finance automatically." };
  }

  if (readSearchParam(searchParams, "error") === "payment-details-required") {
    return {
      tone: "error" as const,
      message: "Approval is blocked until the ambassador saves a valid account name and bank account number. They have been notified."
    };
  }

  if (readSearchParam(searchParams, "error") === "report-review-failed") {
    return { tone: "error" as const, message: "The report could not be approved. Please try again." };
  }

  return null;
}

function getAmbassadorNotice(searchParams: Record<string, string | string[] | undefined>) {
  const reviewed = readSearchParam(searchParams, "reviewed");
  const error = readSearchParam(searchParams, "error");
  const deleted = readSearchParam(searchParams, "deleted");
  const connected = readSearchParam(searchParams, "connected");

  if (connected === "platform") {
    return {
      tone: "success" as const,
      message:
        "Portal invite sent. The login is connected to this volunteer profile, so their existing and future activity will stay together."
    };
  }

  if (deleted === "application") {
    return {
      tone: "success" as const,
      message: "Application and its unused account were permanently deleted."
    };
  }

  if (deleted === "volunteer") {
    return {
      tone: "success" as const,
      message: "Volunteer record was permanently deleted."
    };
  }

  if (deleted === "application-history-preserved" || deleted === "volunteer-history-preserved") {
    return {
      tone: "success" as const,
      message:
        "The record was removed from the active directory and portal access was closed. Linked presentations, feedback, sourcing, and payment history were preserved."
    };
  }

  if (reviewed === "approved") {
    return {
      tone: "success" as const,
      message:
        "Volunteer activated. Their history is unchanged, and portal access is open if an account is connected."
    };
  }

  if (reviewed === "declined") {
    return {
      tone: "success" as const,
      message:
        "Application declined. It remains in Ambassador applications for a clear record, and portal access stays closed."
    };
  }

  if (reviewed === "inactive") {
    return {
      tone: "success" as const,
      message:
        "Volunteer marked inactive. Their profile and full history have been kept, and portal access is closed if an account is connected."
    };
  }

  if (error === "ambassador-email-in-use") {
    return {
      tone: "error" as const,
      message:
        "That email already belongs to a platform user. No records were merged; choose a different email or review the existing user first."
    };
  }

  if (error === "ambassador-already-connected") {
    return {
      tone: "error" as const,
      message: "This volunteer profile is already connected to a platform account."
    };
  }

  if (
    error === "invalid-review" ||
    error === "review-failed" ||
    error === "invalid-ambassador-delete" ||
    error === "ambassador-delete-failed" ||
    error === "invalid-ambassador-connect" ||
    error === "ambassador-connect-failed" ||
    error === "ambassador-not-found"
  ) {
    return {
      tone: "error" as const,
      message: "The ambassador record could not be updated. Please review it and try again."
    };
  }

  return null;
}

function getStaffContentNotice(searchParams: Record<string, string | string[] | undefined>) {
  if (readSearchParam(searchParams, "deleted") === "bookings") {
    const count = Number(readSearchParam(searchParams, "deletedCount")) || 0;
    return {
      tone: "success" as const,
      message: count ? `${count} booking${count === 1 ? "" : "s"} deleted successfully.` : "The selected bookings have already been removed."
    };
  }
  if (["booking-delete-failed", "invalid-booking-deletion"].includes(readSearchParam(searchParams, "error") || "")) {
    return {
      tone: "error" as const,
      message: "The bookings could not be deleted. Select up to 100 bookings and try again."
    };
  }

  if (readSearchParam(searchParams, "created") === "booking") {
    const reference = readSearchParam(searchParams, "reference");
    return {
      tone: "success" as const,
      message: reference ? `Booking logged successfully. Reference: ${reference}.` : "Booking logged successfully."
    };
  }
  if (readSearchParam(searchParams, "error") === "booking-in-progress") {
    return {
      tone: "error" as const,
      message: "This booking is already being saved. Check the booking list before trying again."
    };
  }

  const error = readSearchParam(searchParams, "error");
  const saved = readSearchParam(searchParams, "saved");
  const deleted = readSearchParam(searchParams, "deleted");
  const withdrawal = readSearchParam(searchParams, "withdrawal");
  const resolved = readSearchParam(searchParams, "resolved");

  if (resolved === "approve" || resolved === "decline") {
    return {
      tone: "success" as const,
      message:
        resolved === "approve"
          ? "Reschedule approved. The session time and calendar have been updated."
          : "Reschedule declined. The original session time remains in place."
    };
  }

  if (error?.includes("reschedule")) {
    return {
      tone: "error" as const,
      message: "The reschedule could not be resolved. Review the date and time, then try again."
    };
  }

  if (withdrawal === "approved") {
    return {
      tone: "success" as const,
      message: "Withdrawal approved - the session has returned to the open pool."
    };
  }

  if (withdrawal === "declined") {
    return {
      tone: "success" as const,
      message: "Withdrawal declined - the ambassador remains assigned and has been notified."
    };
  }

  if (error === "invalid-withdrawal-resolution") {
    return {
      tone: "error" as const,
      message: "That withdrawal decision was incomplete. Please try again."
    };
  }

  if (error === "no-withdrawal-pending") {
    return {
      tone: "error" as const,
      message: "That withdrawal request has already been resolved or is no longer pending."
    };
  }

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
        "The file could not be uploaded. Check the file and try again, or contact the platform administrator."
    };
  }

  if (error === "resource-save-failed") {
    return {
      tone: "error" as const,
      message: "The resource could not be saved. Please try again."
    };
  }

  if (error === "resource-delete-failed") {
    return {
      tone: "error" as const,
      message: "The resource could not be deleted. Please try again."
    };
  }

  if (error === "invalid-training-pack") {
    return {
      tone: "error" as const,
      message: "Enter a pack name before saving."
    };
  }

  if (error === "training-pack-save-failed") {
    return {
      tone: "error" as const,
      message: "The training pack could not be created. Please try again."
    };
  }

  if (error === "training-pack-presentation-in-use") {
    return {
      tone: "error" as const,
      message: "That presentation is already linked to another training pack. Choose a different presentation or leave it unlinked."
    };
  }

  if (error === "training-pack-storage-missing") {
    return {
      tone: "error" as const,
      message: "Training pack storage has not been installed in this Supabase project. Apply database migrations 0035 and 0036, then try again."
    };
  }

  if (error === "training-pack-optional-link-pending") {
    return {
      tone: "error" as const,
      message: "Standalone packs need the latest database update before they can be created."
    };
  }

  if (error === "training-pack-delete-failed") {
    return {
      tone: "error" as const,
      message: "The training pack could not be deleted. Please try again."
    };
  }

  if (error === "training-pack-not-empty") {
    return {
      tone: "error" as const,
      message: "Delete the resources inside this pack before deleting the pack."
    };
  }

  if (error === "training-pack-confirmation-mismatch") {
    return {
      tone: "error" as const,
      message: "Type delete to confirm. Nothing was deleted."
    };
  }

  if (saved === "resource") {
    return {
      tone: "success" as const,
      message: "Resource changes have been saved."
    };
  }

  if (saved === "training-pack") {
    return {
      tone: "success" as const,
      message: "Training pack created successfully."
    };
  }

  if (deleted === "resource") {
    return {
      tone: "success" as const,
      message: "Resource deleted successfully."
    };
  }

  if (deleted === "training-pack") {
    return {
      tone: "success" as const,
      message: "Training pack deleted. The linked presentation is unchanged."
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
      role={tone === "error" ? "alert" : "status"}
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
