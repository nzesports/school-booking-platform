import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { ResourceAudience } from "@/lib/domain/types";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CircleCheck,
  CircleDollarSign,
  Clock3,
  FileText,
  FolderKanban,
  GraduationCap,
  Info,
  Layers3,
  MapPinned,
  Plus,
  School2,
  SlidersHorizontal,
  Trash2,
  Upload,
  UsersRound
} from "lucide-react";

import { logoutAction } from "@/app/auth/actions";
import {
  connectAmbassadorPortalAccountAction,
  createEmailTemplateAction,
  createTrainingPackAction,
  deleteAmbassadorRecordAction,
  deletePortalUserAction,
  deleteRegionAction,
  deleteTrainingPackAction,
  invitePortalUserAction,
  logStaffFeedbackAction,
  markNotificationReadAction,
  markReportReviewedAction,
  reviewAmbassadorAction,
  reviewSchoolFeedbackAction,
  saveManualBookingAction,
  saveEmailTemplateAction,
  sendTestEmailAction,
  saveHomepageSectionAction,
  saveManualSchoolAction,
  savePresentationAction,
  savePortalProfileAction,
  saveRegionAction,
  saveResourceEditorAction,
  saveResourceAction,
  updateUserAccessAction
} from "@/app/portal/actions";
import {
  AmbassadorProfileWorkspace,
  type AmbassadorProfileSection
} from "@/components/dashboard/ambassadors-workspace";
import { CopyTextButton } from "@/components/dashboard/copy-text-button";
import { EmailTemplatesWorkspace } from "@/components/dashboard/email-templates-workspace";
import { OperationsAnalytics } from "@/components/dashboard/operations-analytics";
import { RegionsManager } from "@/components/dashboard/regions-manager";
import { ResourcesWorkspace } from "@/components/dashboard/resources-workspace";
import { FeedbackHub } from "@/components/dashboard/feedback-hub";
import {
  BookingLifecyclePanel,
  SchoolDeliveryDatabase
} from "@/components/dashboard/operations-views";
import {
  PaymentsWorkspace,
  getPaymentsNotice
} from "@/components/dashboard/payments-workspace";
import { PortalProfileWorkspace } from "@/components/dashboard/portal-profile-workspace";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { ManualSchoolDialog } from "@/components/dashboard/manual-school-dialog";
import { ManualBookingDialog } from "@/components/dashboard/manual-booking-dialog";
import { LogFeedbackDialog } from "@/components/dashboard/log-feedback-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { StatusBadge } from "@/components/ui/status-badge";
import { requirePortalAccess } from "@/lib/services/auth";
import {
  buildFilteredDashboardData,
  buildPresentationPerformance,
  dashboardRangeLabel,
  dashboardRangeOptions,
  readBookingLifecycleView,
  readDashboardCustomRange,
  readDashboardRange
} from "@/lib/services/dashboard-insights";
import { getPaymentSettings } from "@/lib/services/payment-automation";
import { getAdminPortalData } from "@/lib/services/portal";
import { cn, formatCurrency, formatDateTime, formatShortDate, titleCase } from "@/lib/utils";

const directoryGridClass =
  "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,110px)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,180px)]";

const avatarPalette = [
  "bg-[#ece9ff] text-[#5b4fc0]",
  "bg-[#e3f2fd] text-[#1565c0]",
  "bg-[#e6f5ee] text-[#178247]",
  "bg-[#fff3d8] text-[#9a6900]"
];

function maskEmail(email: string) {
  const [local, domain] = email.split("@");

  if (!domain) {
    return email;
  }

  return `${local.slice(0, 2)}${"•".repeat(Math.max(local.length - 2, 3))}@${domain}`;
}

const navItems = [
  { href: "/admin", label: "Dashboard", icon: SlidersHorizontal },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/schools", label: "Schools", icon: School2 },
  { href: "/admin/regions", label: "Regions", icon: MapPinned },
  { href: "/admin/feedback", label: "Feedback", icon: Bell },
  {
    href: "/admin/ambassadors",
    label: "Ambassadors",
    icon: UsersRound,
    separatorBefore: true
  },
  { href: "/admin/payments", label: "Payments", icon: CircleDollarSign },
  {
    href: "/admin/training",
    label: "Training",
    icon: GraduationCap,
    separatorBefore: true
  },
  { href: "/admin/materials", label: "Materials", icon: FolderKanban },
  { href: "/admin/presentations", label: "Presentations", icon: Layers3 },
  { href: "/admin/email-templates", label: "Email templates", icon: FileText }
];

export default async function AdminPortalPage({
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
    redirect("/admin/training");
  }
  const actor = await requirePortalAccess("super_admin");
  const portal = await getAdminPortalData(actor.id);
  const customRange = readDashboardCustomRange(
    resolvedSearchParams.from,
    resolvedSearchParams.to
  );
  const requestedDashboardRange =
    route === "bookings"
      ? "all"
      : !resolvedSearchParams.range && route === "feedback"
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
  const ambassadorTab =
    readSearchParam(resolvedSearchParams, "view") === "pending" ? "pending" : "approved";
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
  const presentationTab =
    readSearchParam(resolvedSearchParams, "tab") === "public-content"
      ? "public-content"
      : "types";
  const presentationFilterId = readSearchParam(resolvedSearchParams, "presentation") ?? undefined;
  const filteredDashboard = buildFilteredDashboardData(
    portal.bookings,
    portal.reports,
    portal.ambassadors,
    portal.schoolReviews,
    dashboardRange,
    portal.activityLogs,
    customRange
  );
  const composeOpen = readSearchParam(resolvedSearchParams, "compose") === "1";
  const deleteUserId = readSearchParam(resolvedSearchParams, "delete");
  const staffDirectoryUsers = portal.users.filter(
    (user) => user.role === "staff" || user.role === "super_admin"
  );
  const ambassadorDirectoryUsers = portal.users.filter((user) => user.role === "ambassador");
  const usersTab =
    readSearchParam(resolvedSearchParams, "tab") === "ambassadors" ? "ambassadors" : "staff";
  const directoryUsers = usersTab === "ambassadors" ? ambassadorDirectoryUsers : staffDirectoryUsers;
  const activeSuperAdminCount = portal.users.filter(
    (user) => user.role === "super_admin" && user.status === "active"
  ).length;
  const usersHref = (suffix?: string) => {
    const parts = [usersTab === "ambassadors" ? "tab=ambassadors" : "", suffix ?? ""].filter(
      Boolean
    );
    return parts.length > 0 ? `/admin/users?${parts.join("&")}` : "/admin/users";
  };
  const selectedDeleteUser = deleteUserId
    ? directoryUsers.find((user) => user.id === deleteUserId)
    : null;
  const usersNotice = route === "users" ? getUsersNotice(resolvedSearchParams) : null;
  const regionsNotice = route === "regions" ? getRegionsNotice(resolvedSearchParams) : null;
  const isCreatingPresentation = route === "presentations/new";
  const selectedPresentation =
    route.startsWith("presentations/") && !isCreatingPresentation
      ? portal.presentations.find((presentation) => presentation.id === route.replace("presentations/", ""))
      : null;
  const presentationEditor = isCreatingPresentation
    ? {
        id: "",
        title: "",
        slug: "",
        shortSummary: "",
        contentSnippet: "",
        fullDescription: "",
        yearLevels: "Years 7 to 13",
        durationMinutes: 45,
        deliveryFormats: ["Assembly", "Workshop"],
        learningOutcomes: [] as string[],
        requiredEquipment: [] as string[],
        youtubeUrl: undefined as string | undefined,
        imageUrl: undefined,
        accentColor: "#18A83B",
        active: true,
        public: true
      }
    : selectedPresentation;
  const requestedResourcePresentationId = readSearchParam(
    resolvedSearchParams,
    "presentation"
  );
  const requestedResourcePresentation = portal.presentations.find(
    (presentation) => presentation.id === requestedResourcePresentationId
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
        type: requestedResourcePresentation ? "slide_deck" : "pdf",
        category: requestedResourcePresentation ? ("presentation_material" as const) : ("resource" as const),
        audience: requestedResourcePresentation ? ("ambassador" as const) : ("school" as const),
        audiences: (requestedResourcePresentation
          ? ["ambassador"]
          : ["school"]) as ResourceAudience[],
        // School-audience resources are only visible to schools when sharing is
        // public, so the general library editor defaults to a working combination.
        sharingScope: requestedResourcePresentation
          ? ("internal" as const)
          : ("public" as const),
        tags: [],
        presentationTypeId: requestedResourcePresentation?.id ?? "",
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
  const contentNotice = getContentNotice(resolvedSearchParams);
  const reportNotice = getReportApprovalNotice(resolvedSearchParams);
  const cataloguePresentations = portal.presentations.filter(
    (presentation) => presentation.slug !== "careers"
  );
  const presentationPerformance = buildPresentationPerformance(
    cataloguePresentations,
    portal.bookings,
    portal.reports,
    portal.schoolReviews
  );
  const selectedAmbassador = route.startsWith("ambassadors/")
    ? portal.ambassadors.find((ambassador) => ambassador.id === route.replace("ambassadors/", ""))
    : null;
  const pendingAmbassadors = portal.ambassadors.filter(
    (ambassador) => ambassador.status === "applied"
  );
  const approvedAmbassadors = portal.ambassadors.filter(
    (ambassador) => ambassador.status === "approved" || ambassador.status === "inactive"
  );
  const visibleAmbassadors =
    ambassadorTab === "pending" ? pendingAmbassadors : approvedAmbassadors;
  const ambassadorListHref = `/admin/ambassadors?view=${ambassadorTab}`;
  const paymentSettings = route === "payments" ? await getPaymentSettings() : null;
  const feedbackSearchParams = new URLSearchParams({ range: dashboardRange });
  if (customRange) {
    feedbackSearchParams.set("from", customRange.from);
    feedbackSearchParams.set("to", customRange.to);
  }
  if (presentationFilterId) {
    feedbackSearchParams.set("presentation", presentationFilterId);
  }
  const feedbackReturnTo = `/admin/feedback?${feedbackSearchParams.toString()}`;
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

  const headline =
    route === ""
      ? `Good morning, ${actor.fullName.split(" ")[0]}`
      : route === "bookings"
        ? "Manage Bookings"
        : route === "schools"
          ? "School Information"
          : route === "ambassadors"
            ? "Manage ambassadors and applications"
            : route.startsWith("ambassadors/")
              ? selectedAmbassador?.status === "applied" || selectedAmbassador?.status === "declined"
                ? "Review ambassador application"
                : "Ambassador profile"
              : route === "reports"
                ? "School & ambassador feedback"
                : route === "payments"
                  ? "Track invoices and payments"
          : route === "users"
            ? "Manage live access"
              : route === "presentations"
                ? "Manage presentation content and visibility"
                : route === "presentations/new"
                  ? "Create a new presentation"
                  : route.startsWith("presentations/")
                    ? "Edit presentation"
                    : route === "regions"
                      ? "Control regional availability"
                      : route === "training"
                        ? "Build ambassador training packs"
                        : route === "materials"
                          ? "Manage public materials"
                        : route === "resources/new"
                          ? "Create a new resource"
                          : route.startsWith("resources/")
                            ? "Edit resource content"
                            : route === "pages-content"
                              ? "Update homepage and content blocks"
                              : route === "feedback"
                                ? "School & ambassador feedback"
                                : route === "email-templates"
                                  ? "Manage transactional email templates"
                                  : route === "audit-logs"
                                    ? "Review recent admin actions"
                                    : route === "profile"
                                      ? "Your profile"
                                    : route === "activity"
                                      ? "Admin activity and ambassador approvals"
                                      : "Platform configuration";

  return (
    <main className="min-h-screen">
      <DashboardShell
        title="Super Admin"
        role="super_admin"
        navItems={navItems}
        currentPath={`/admin${route ? `/${route}` : ""}`}
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
                href:
                  route === "feedback"
                    ? `/admin/feedback?range=${option.value}${presentationFilterId ? `&presentation=${presentationFilterId}` : ""}`
                    : `/admin?range=${option.value}${analyticsYear ? `&analyticsYear=${analyticsYear}` : ""}`
              }))
            : undefined
        }
        activeRange={route === "" || route === "feedback" ? dashboardRange : undefined}
        customRange={route === "" || route === "feedback" ? customRange : undefined}
        headerAction={
          route === "bookings" ? (
            <ManualBookingDialog
              key={readSearchParam(resolvedSearchParams, "reference") || "new-booking"}
              basePath="/admin"
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
              returnTo="/admin/schools"
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
              href="/admin/materials?upload=1"
              variant="secondary"
              className="border-[#d8c8f4] bg-[#f8f5ff] text-[#6941c6] shadow-none hover:bg-[#f1edfd]"
            >
              <Upload className="h-4 w-4" />
              Upload material
            </ButtonLink>
          ) : route === "training" ? (
            <ButtonLink
              href="/admin/training?add=1"
              variant="secondary"
              className="border-[#bfe6d2] bg-[#eaf8ee] text-[#117a2e] shadow-none hover:bg-[#dff3e4]"
            >
              <Plus className="h-4 w-4" />
              Add training resource
            </ButtonLink>
          ) : undefined
        }
        activityHref="/admin/activity"
        notificationCount={
          portal.notifications.filter((notification) => !notification.readAt).length
        }
        notifications={portal.notifications}
        markNotificationReadAction={markNotificationReadAction}
        logoutAction={logoutAction}
        auditLogsHref="/admin/audit-logs"
        usersHref="/admin/users"
        profile={{
          name: actor.fullName,
          subtitle: "Platform Admin",
          imageUrl: actor.avatarUrl ?? null,
          imageAlt: `${actor.fullName} profile image`,
          href: "/admin/profile"
        }}
      >
        {route === "" ? (
          <OperationsAnalytics
            basePath="/admin"
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
            emailTemplatesCount={portal.emailTemplates.length}
            activeSuperAdminsCount={
              activeSuperAdminCount
            }
            presentationsHref="/admin/presentations"
            regionsHref="/admin/regions"
          />
        ) : null}

        {route === "bookings" ? (
          <div className="grid gap-4">
            {contentNotice ? (
              <NoticeBanner tone={contentNotice.tone}>{contentNotice.message}</NoticeBanner>
            ) : null}
            <BookingLifecyclePanel
              key={portal.bookings.map((booking) => booking.id).join(",")}
              basePath="/admin"
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

        {route === "schools" ? (
          <SchoolDeliveryDatabase
            schools={portal.schools}
            bookings={portal.bookings}
            regions={portal.regions}
            basePath="/admin"
          />
        ) : null}

        {route === "ambassadors" ? (
          <DataTable
            title="Ambassador pipeline"
            headerContent={
              <nav
                aria-label="Ambassador status"
                className="flex gap-7 border-b border-[color:var(--border-soft)]"
              >
                {[
                  { value: "approved", label: "Approved", icon: CircleCheck },
                  { value: "pending", label: "Pending", icon: Clock3 }
                ].map(({ value, label, icon: Icon }) => {
                  const isActive = ambassadorTab === value;

                  return (
                    <Link
                      key={value}
                      href={`/admin/ambassadors?view=${value}`}
                      prefetch={false}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={
                        value === "pending" && pendingAmbassadors.length > 0
                          ? `Pending, ${pendingAmbassadors.length} awaiting review`
                          : label
                      }
                      className={cn(
                        "relative inline-flex items-center gap-2 px-1 pb-3 text-sm font-semibold transition",
                        isActive
                          ? "text-[color:var(--navy)]"
                          : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                      {value === "pending" && pendingAmbassadors.length > 0 ? (
                        <span
                          aria-hidden="true"
                          className="absolute -right-1 top-0 h-2 w-2 rounded-full bg-[#f4b63f] ring-2 ring-white"
                        />
                      ) : null}
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[color:var(--green)]"
                        />
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            }
            columns={["Name", "Region", "Travel", "Pending payout", "Status", "Action"]}
            emptyMessage={
              ambassadorTab === "pending"
                ? "No ambassador applications are waiting for review."
                : "No approved ambassadors to show."
            }
            rows={visibleAmbassadors.map((ambassador) => [
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
                href={`/admin/ambassadors/${ambassador.id}?view=${ambassadorTab}`}
                variant="ghost"
                className="min-h-[38px] rounded-[14px] px-3 py-1.5"
              >
                {ambassadorTab === "pending" ? "Review application" : "View profile"}
              </ButtonLink>
            ])}
          />
        ) : null}

        {selectedAmbassador ? (
          <div className="grid gap-5">
            <div>
              <ButtonLink
                href={ambassadorListHref}
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
              basePath="/admin/ambassadors"
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
              reports={route === "feedback" ? filteredDashboard.reports : portal.reports}
              schoolReviews={
                route === "feedback" ? filteredDashboard.schoolReviews : portal.schoolReviews
              }
              reviewAction={markReportReviewedAction}
              feedbackDecisionAction={reviewSchoolFeedbackAction}
              returnTo={feedbackReturnTo}
              reportsReturnTo="/admin/reports"
              initialTab={route === "reports" ? "ambassador" : "school"}
              showAmbassadorColumn
              presentationFilterId={presentationFilterId}
            />
          </div>
        ) : null}

        {route === "payments" ? (
          <PaymentsWorkspace
            basePath="/admin"
            payments={portal.payments}
            sessions={portal.bookings.flatMap((booking) => booking.sessions)}
            financeEmail={paymentSettings?.financeEmail ?? "info@esf.nz"}
            notice={getPaymentsNotice(resolvedSearchParams)}
          />
        ) : null}


        {route === "users" ? (
          <Card className="rounded-[34px]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                  Current staff and admin access
                </h2>
              </div>
              <ButtonLink
                href={composeOpen ? usersHref() : usersHref("compose=1")}
                variant={composeOpen ? "secondary" : "primary"}
                className="min-w-[148px]"
              >
                <Plus className="h-4 w-4" />
                {composeOpen ? "Close" : "Add user"}
              </ButtonLink>
            </div>

            <div className="mt-6 flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-full border border-[rgba(4,15,75,0.08)] bg-[rgba(247,250,252,0.92)] p-1.5">
              {[
                {
                  key: "staff",
                  label: `Staff & admins (${staffDirectoryUsers.length})`,
                  href: "/admin/users"
                },
                {
                  key: "ambassadors",
                  label: `Ambassadors (${ambassadorDirectoryUsers.length})`,
                  href: "/admin/users?tab=ambassadors"
                }
              ].map((tab) => (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={cn(
                    "inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-full px-5 text-sm font-semibold transition",
                    usersTab === tab.key
                      ? "bg-[linear-gradient(135deg,rgba(175,213,237,0.92),rgba(234,248,238,0.96))] text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                      : "text-[color:var(--text-soft)] hover:bg-white hover:text-[color:var(--navy)]"
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </div>

            {usersNotice ? (
              <div className="relative mt-6">
                <NoticeBanner tone={usersNotice.tone} className="pr-14">
                  {usersNotice.message}
                </NoticeBanner>
                <ButtonLink
                  href={usersHref()}
                  variant="ghost"
                  className="absolute right-3 top-1/2 min-h-0 -translate-y-1/2 rounded-full px-2.5 py-1 text-base leading-none"
                >
                  ×
                </ButtonLink>
              </div>
            ) : null}

            {composeOpen ? (
              <div className="mt-6 rounded-[28px] border border-[color:rgba(4,15,75,0.08)] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                      Invite access
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                      Add staff, super admins, or ambassadors
                    </h3>
                    <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                      The invite email lets them set a password. Ambassadors added here are
                      approved automatically and skip the application queue.
                    </p>
                  </div>
                  <ButtonLink href="/admin/users" variant="ghost" className="min-h-[40px] px-3 py-2">
                    Dismiss
                  </ButtonLink>
                </div>
                <form
                  action={invitePortalUserAction}
                  className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_200px_220px_auto]"
                >
                  <Field label="Full name">
                    <input
                      name="fullName"
                      required
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                      placeholder="Jordan Lee"
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      name="email"
                      type="email"
                      required
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                      placeholder="jordan@example.com"
                    />
                  </Field>
                  <Field label="Role">
                    <select
                      name="role"
                      defaultValue="staff"
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    >
                      <option value="staff">Staff</option>
                      <option value="super_admin">Super admin</option>
                      <option value="ambassador">Ambassador</option>
                    </select>
                  </Field>
                  <Field label="Region (ambassadors)">
                    <select
                      name="regionSlug"
                      defaultValue=""
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    >
                      <option value="">Select region</option>
                      {portal.regions
                        .filter((region) => region.isActive)
                        .map((region) => (
                          <option key={region.id} value={region.slug}>
                            {region.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <div className="grid items-end">
                    <PendingSubmitButton unstyled
                      type="submit"
                      className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)]"
                    >
                      Send invite
                    </PendingSubmitButton>
                  </div>
                </form>
              </div>
            ) : null}

            <div className="mt-6 overflow-hidden rounded-[24px] border border-[color:var(--border-soft)] bg-white/92">
              <div
                className={cn(
                  "hidden gap-4 border-b border-[color:var(--border-soft)] bg-[#f6f9fd] px-5 py-3 lg:grid",
                  directoryGridClass
                )}
              >
                {["User", "Joined", "Role", "Status", "Tags & access", "Actions"].map((label) => (
                  <p
                    key={label}
                    className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
                  >
                    {label}
                  </p>
                ))}
              </div>

              {directoryUsers.length === 0 ? (
                <p className="px-5 py-8 text-sm text-[color:var(--text-soft)]">
                  {usersTab === "ambassadors"
                    ? "No ambassador accounts yet. Invite one with “Add user” or approve an application from the Ambassadors page."
                    : "No staff or admin accounts yet. Invite one with “Add user”."}
                </p>
              ) : null}

              {directoryUsers.map((user, index) => {
                const isDeleteOpen = selectedDeleteUser?.id === user.id;
                const isCurrentUser = user.id === actor.id;
                const isSoleActiveSuperAdmin =
                  user.role === "super_admin" &&
                  user.status === "active" &&
                  activeSuperAdminCount <= 1;
                const accessFormId = `access-form-${user.id}`;

                return (
                  <div
                    key={user.id}
                    className={cn(
                      "px-5 py-5",
                      index > 0 && "border-t border-[color:var(--border-soft)]"
                    )}
                  >
                    <form id={accessFormId} action={updateUserAccessAction} className="hidden">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="tab" value={usersTab} />
                    </form>

                    <div className={cn("grid gap-4 lg:items-center", directoryGridClass)}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold",
                            avatarPalette[index % avatarPalette.length]
                          )}
                        >
                          {(user.fullName || user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[color:var(--navy)]">
                            {user.fullName}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="truncate text-sm text-[color:var(--text-soft)]">
                              {maskEmail(user.email)}
                            </p>
                            <CopyTextButton value={user.email} label="Copy email address" />
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] lg:hidden">
                          Joined
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--text-muted)] lg:mt-0">
                          {user.createdAt ? formatShortDate(user.createdAt) : "Recently"}
                        </p>
                      </div>

                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] lg:hidden">
                          Role
                        </p>
                        <select
                          name="role"
                          form={accessFormId}
                          defaultValue={user.role}
                          disabled={isSoleActiveSuperAdmin}
                          title={
                            isSoleActiveSuperAdmin
                              ? "At least one active super admin is required."
                              : undefined
                          }
                          className="w-full rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:bg-[#f2f5fa] disabled:text-[color:var(--text-soft)]"
                        >
                          <option value="staff">Staff</option>
                          <option value="super_admin">Super admin</option>
                          <option value="ambassador">Ambassador</option>
                        </select>
                      </div>

                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] lg:hidden">
                          Status
                        </p>
                        <select
                          name="status"
                          form={accessFormId}
                          defaultValue={user.status}
                          disabled={isSoleActiveSuperAdmin}
                          title={
                            isSoleActiveSuperAdmin
                              ? "At least one active super admin is required."
                              : undefined
                          }
                          className="w-full rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:bg-[#f2f5fa] disabled:text-[color:var(--text-soft)]"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>

                      <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] lg:hidden">
                          Tags &amp; access
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {isCurrentUser ? (
                            <span className="rounded-full bg-[color:var(--blue-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--navy)]">
                              Current user
                            </span>
                          ) : null}
                          {isSoleActiveSuperAdmin ? (
                            <span className="rounded-full bg-[#eaf8ee] px-3 py-1 text-xs font-semibold text-[#117a2e]">
                              Required admin
                            </span>
                          ) : null}
                          <span className="rounded-full bg-[#e9edff] px-3 py-1 text-xs font-semibold text-[#4a5fd5]">
                            {titleCase(user.role)}
                          </span>
                          {user.role === "ambassador" ? (
                            <span className="rounded-full bg-[#fff3dd] px-3 py-1 text-xs font-semibold text-[#c07a12]">
                              {user.ambassadorStatus
                                ? `Ambassador ${user.ambassadorStatus}`
                                : "Missing ambassador profile"}
                            </span>
                          ) : null}
                          <StatusBadge value={user.status === "active" ? "confirmed" : "cancelled"} />
                          {user.role === "ambassador" && user.ambassadorProfileId ? (
                            <ButtonLink
                              href={`/admin/ambassadors/${user.ambassadorProfileId}`}
                              variant="ghost"
                              className="min-h-[30px] rounded-[10px] px-2 py-1 text-xs font-semibold text-[#4a5fd5]"
                            >
                              Review ambassador
                            </ButtonLink>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {isCurrentUser ? (
                          <span
                            title="Manage your own access from another super admin account."
                            className="inline-flex items-center gap-2 rounded-[14px] border border-[color:var(--border-soft)] bg-[#f2f5fa] px-4 py-2.5 text-sm font-semibold text-[color:var(--text-soft)]"
                          >
                            Current account
                            <Info className="h-4 w-4" />
                          </span>
                        ) : isSoleActiveSuperAdmin ? (
                          <span
                            title="At least one active super admin is required."
                            className="inline-flex items-center gap-2 rounded-[14px] border border-[color:var(--border-soft)] bg-[#f2f5fa] px-4 py-2.5 text-sm font-semibold text-[color:var(--text-soft)]"
                          >
                            Locked
                            <Info className="h-4 w-4" />
                          </span>
                        ) : (
                          <>
                            <PendingSubmitButton unstyled
                              type="submit"
                              form={accessFormId}
                              className="inline-flex min-h-[42px] items-center justify-center rounded-[14px] border border-[color:rgba(4,15,75,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--navy)] transition hover:border-[color:rgba(4,15,75,0.24)]"
                            >
                              Save
                            </PendingSubmitButton>
                            {isDeleteOpen ? (
                              <ButtonLink
                                href={usersHref()}
                                variant="secondary"
                                className="min-h-[42px] rounded-[14px] px-4 py-2"
                              >
                                Cancel
                              </ButtonLink>
                            ) : (
                              <ButtonLink
                                href={usersHref(`delete=${user.id}`)}
                                variant="danger"
                                className="min-h-[42px] rounded-[14px] px-4 py-2"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </ButtonLink>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isDeleteOpen && !isCurrentUser && !isSoleActiveSuperAdmin ? (
                      <form
                        action={deletePortalUserAction}
                        className="mt-5 grid gap-4 rounded-[24px] border border-[#f3b4b4] bg-[#fff7f7] p-4"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="returnTo" value={usersHref()} />
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#b42318]">
                            Delete user
                          </p>
                          <p className="mt-2 text-sm leading-7 text-[#8f2d2d]">
                            This permanently removes {user.fullName}&apos;s login and profile access.
                            Type <span className="font-semibold">DELETE</span> to confirm.
                          </p>
                        </div>
                        <Field label="Type DELETE to confirm">
                          <input
                            name="confirmationText"
                            required
                            className="w-full rounded-[18px] border border-[#f2c6c6] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)]"
                            placeholder="DELETE"
                          />
                        </Field>
                        <div className="flex flex-wrap gap-3">
                          <PendingSubmitButton unstyled
                            type="submit"
                            className="inline-flex min-h-[46px] items-center justify-center rounded-[18px] border border-[#f3b4b4] bg-[#fff0f0] px-5 py-2.5 text-sm font-semibold text-[#9d2424] shadow-[0_10px_24px_rgba(157,36,36,0.1)]"
                          >
                            Permanently delete user
                          </PendingSubmitButton>
                          <ButtonLink href={usersHref()} variant="secondary" className="min-h-[46px]">
                            Keep user
                          </ButtonLink>
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>

          </Card>
        ) : null}

        {route === "presentations" ? (
          <Card className="rounded-[34px]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <nav
                aria-label="Presentation workspace"
                className="flex flex-wrap gap-7 border-b border-[color:var(--border-soft)]"
              >
                {[
                  { value: "types", label: "Presentation types" },
                  { value: "public-content", label: "Front page & Learn more content" }
                ].map((tab) => {
                  const isActive = presentationTab === tab.value;

                  return (
                    <Link
                      key={tab.value}
                      href={
                        tab.value === "types"
                          ? "/admin/presentations"
                          : "/admin/presentations?tab=public-content"
                      }
                      prefetch={false}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative inline-flex items-center px-1 pb-3 text-base font-semibold transition",
                        isActive
                          ? "text-[color:var(--navy)]"
                          : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
                      )}
                    >
                      {tab.label}
                      {isActive ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[color:var(--green)]"
                        />
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
              <ButtonLink href="/admin/presentations/new">
                <Plus className="h-4 w-4" />
                Add presentation
              </ButtonLink>
            </div>

            {contentNotice?.scope === "presentation" ? (
              <NoticeBanner tone={contentNotice.tone} className="mt-6">
                {contentNotice.message}
              </NoticeBanner>
            ) : null}

            {presentationTab === "types" ? (
              <div className="mt-6 overflow-hidden rounded-[26px] border border-[color:var(--border-soft)] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)]">
                <div className="px-5 py-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                    Presentation performance
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                    Delivery, attendance, and feedback stats across the full platform.
                  </p>
                </div>
                <table className="min-w-full border-separate border-spacing-0 bg-white/84">
                  <thead>
                    <tr>
                      {[
                        "Presentation",
                        "Delivered",
                        "Upcoming",
                        "Attendees",
                        "Teacher rating",
                        "School rating",
                        "Reviews"
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="border-b border-[color:rgba(4,15,75,0.08)] px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {presentationPerformance.map((item) => (
                      <tr key={item.presentation.id} className="align-top">
                        <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 font-semibold text-[color:var(--navy)]">
                          <ButtonLink
                            href={`/admin/feedback?presentation=${item.presentation.id}`}
                            variant="ghost"
                            className="min-h-[34px] rounded-[12px] px-3 py-1.5"
                          >
                            {item.presentation.title}
                          </ButtonLink>
                        </td>
                        <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 text-sm text-[color:var(--text-soft)]">
                          {item.deliveredCount}
                        </td>
                        <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 text-sm text-[color:var(--text-soft)]">
                          {item.upcomingCount}
                        </td>
                        <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 text-sm text-[color:var(--text-soft)]">
                          {item.totalAttendees}
                        </td>
                        <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 text-sm text-[color:var(--text-soft)]">
                          {item.avgTeacherRating ? `${item.avgTeacherRating}/5` : "No data"}
                        </td>
                        <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 text-sm text-[color:var(--text-soft)]">
                          {item.avgSchoolRating ? `${item.avgSchoolRating}/5` : "No data"}
                        </td>
                        <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 text-sm text-[color:var(--text-soft)]">
                          {item.reviewCount} reviews · {item.reportCount} reports
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-6 grid gap-5">
                <div className="rounded-[20px] border border-[rgba(24,168,59,0.18)] bg-[linear-gradient(135deg,#f5fcf7,#f6faff)] px-5 py-4">
                  <p className="font-semibold text-[color:var(--navy)]">
                    One edit updates both public views
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">
                    Short summaries feed the front-page cards. Descriptions, outcomes, equipment,
                    formats, audience details, and What to expect feed each Learn more page.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-[26px] border border-[color:var(--border-soft)] bg-white/96">
                  <table className="min-w-[960px] border-separate border-spacing-0 xl:min-w-full">
                    <thead>
                      <tr>
                        {["Title", "Year levels", "Duration", "Visibility", "Status", "Actions"].map((heading) => (
                          <th
                            key={heading}
                            className="border-b border-[color:rgba(4,15,75,0.08)] px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cataloguePresentations.map((presentation) => (
                        <tr key={presentation.id} className="align-top">
                          <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 font-semibold text-[color:var(--navy)]">
                            {presentation.title}
                          </td>
                          <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 text-sm text-[color:var(--text-soft)]">
                            {presentation.yearLevels}
                          </td>
                          <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 text-sm text-[color:var(--text-soft)]">
                            {presentation.durationMinutes} mins
                          </td>
                          <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4 text-sm text-[color:var(--text-soft)]">
                            <span className={presentation.public ? "inline-flex rounded-full bg-[#e8f1fd] px-2.5 py-1 text-xs font-semibold text-[#1e4fae]" : "inline-flex rounded-full bg-[#f1edfd] px-2.5 py-1 text-xs font-semibold text-[#6941c6]"}>
                              {presentation.public ? "Public" : "Internal"}
                            </span>
                          </td>
                          <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4">
                            <StatusBadge value={presentation.active ? "confirmed" : "cancelled"} />
                          </td>
                          <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <ButtonLink
                                href={`/admin/presentations/${presentation.id}`}
                                variant="ghost"
                                className="min-h-[38px] rounded-[14px] px-3 py-1.5"
                              >
                                Edit content
                              </ButtonLink>
                              {presentation.public && presentation.active ? (
                                <ButtonLink
                                  href={`/presentations/${presentation.slug}`}
                                  variant="secondary"
                                  className="min-h-[38px] rounded-[14px] px-3 py-1.5"
                                  target="_blank"
                                >
                                  Preview
                                </ButtonLink>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        ) : null}

        {presentationEditor && (selectedPresentation || isCreatingPresentation) ? (
          <Card className="overflow-hidden rounded-[38px] p-0">
            <div className="border-b border-[color:rgba(4,15,75,0.08)] px-6 py-6 md:px-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
                Presentation management
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                    {isCreatingPresentation ? "Create Presentation" : "Edit Presentation"}
                  </h2>
                  <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                    Refine the presentation details, media, settings, and linked resources from one place.
                  </p>
                </div>
                <ButtonLink href="/admin/presentations" variant="secondary">
                  Back to presentations
                </ButtonLink>
              </div>
              <div className="mt-6 flex flex-wrap gap-6 border-b border-[color:rgba(4,15,75,0.06)] pb-1">
                {[
                  ["Details", "#presentation-details"],
                  ["Content", "#presentation-content"],
                  ["Resources", "#presentation-resources"],
                  ["Reviews", "#presentation-reviews"],
                  ["Settings", "#presentation-settings"]
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

            {contentNotice?.scope === "presentation" ? (
              <NoticeBanner tone={contentNotice.tone} className="mx-6 mt-6 md:mx-8">
                {contentNotice.message}
              </NoticeBanner>
            ) : null}

            <form
              action={savePresentationAction}
              className="grid gap-8 px-6 py-8 md:px-8 xl:grid-cols-[minmax(0,1fr)_320px]"
            >
              {presentationEditor.id ? <input type="hidden" name="id" value={presentationEditor.id} /> : null}
              <input
                type="hidden"
                name="returnTo"
                value={isCreatingPresentation ? "/admin/presentations/new" : `/admin/presentations/${presentationEditor.id}`}
              />
              <input type="hidden" name="existingImageUrl" value={presentationEditor.imageUrl ?? ""} />

              <div id="presentation-details" className="grid scroll-mt-8 gap-6">
                <Field label="Title *">
                  <input
                    name="title"
                    defaultValue={presentationEditor.title}
                    required
                    className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm text-[color:var(--text-dark)]"
                  />
                </Field>

                <Field label="URL slug">
                  <input
                    name="slug"
                    defaultValue={presentationEditor.slug}
                    className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm text-[color:var(--text-dark)]"
                    placeholder="Leave blank to auto-generate from the title"
                  />
                </Field>

                <Field
                  label="Front-page card summary"
                  hint="This is the shorter description shown on the homepage presentation card and in search results."
                >
                  <textarea
                    name="shortSummary"
                    defaultValue={presentationEditor.shortSummary}
                    className="min-h-[7.5rem] w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm leading-7 text-[color:var(--text-dark)]"
                  />
                </Field>

                <div id="presentation-content" className="scroll-mt-8">
                  <Field
                    label="Learn more — description"
                    hint="This is the opening body copy at the top of the public Learn more page."
                  >
                    <RichTextEditor
                      name="fullDescription"
                      defaultValue={presentationEditor.fullDescription}
                      placeholder="Describe the full presentation experience."
                    />
                  </Field>
                </div>

                <Field
                  label="Learn more — What to expect"
                  hint="Shown in the What to expect section beneath the outcomes and equipment."
                >
                  <RichTextEditor
                    name="contentSnippet"
                    defaultValue={presentationEditor.contentSnippet ?? ""}
                    placeholder="Explain what schools, students, or whānau can expect from this presentation."
                  />
                </Field>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Learning outcomes" hint="One per line — shown as a list on the public page">
                    <textarea
                      name="learningOutcomes"
                      defaultValue={presentationEditor.learningOutcomes.join("\n")}
                      placeholder={"Healthy screen routines\nDigital citizenship\nPositive online behaviour"}
                      className="min-h-[9rem] w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm leading-7 text-[color:var(--text-dark)]"
                    />
                  </Field>
                  <Field label="Required equipment" hint="One per line">
                    <textarea
                      name="requiredEquipment"
                      defaultValue={presentationEditor.requiredEquipment.join("\n")}
                      placeholder={"Projector or screen\nMicrophone if needed"}
                      className="min-h-[9rem] w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm leading-7 text-[color:var(--text-dark)]"
                    />
                  </Field>
                </div>

                <Field
                  label="YouTube video link"
                  hint="Optional — embedded on the public presentation page so schools can watch a preview"
                >
                  <input
                    name="youtubeUrl"
                    type="url"
                    defaultValue={presentationEditor.youtubeUrl ?? ""}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm text-[color:var(--text-dark)]"
                  />
                </Field>
              </div>

              <div className="grid content-start gap-5">
                <div className="rounded-[28px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                    Presentation image
                  </p>
                  {presentationEditor.imageUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={presentationEditor.imageUrl}
                        alt={presentationEditor.title || "Presentation"}
                        className="mt-4 h-52 w-full rounded-[22px] object-cover"
                      />
                    </>
                  ) : (
                    <div className="mt-4 flex h-52 items-center justify-center rounded-[22px] border border-dashed border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] text-sm text-[color:var(--text-soft)]">
                      No image uploaded yet
                    </div>
                  )}
                  <Field label="Change image">
                    <input
                      type="file"
                      name="image"
                      accept=".png,.jpg,.jpeg,.webp"
                      className="w-full rounded-[18px] border border-dashed border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm"
                    />
                  </Field>
                </div>

                <div id="presentation-settings" className="scroll-mt-8 rounded-[28px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                        Status
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                        Control visibility and publishing state.
                      </p>
                    </div>
                    <label className="relative inline-flex h-8 w-14 items-center">
                      <input
                        type="checkbox"
                        name="isActive"
                        defaultChecked={presentationEditor.active}
                        className="peer sr-only"
                      />
                      <span className="absolute inset-0 rounded-full bg-[#d8e3ef] transition peer-checked:bg-[color:var(--green)]" />
                      <span className="absolute left-1 h-6 w-6 rounded-full bg-white shadow-[0_8px_20px_rgba(11,24,77,0.16)] transition peer-checked:translate-x-6" />
                    </label>
                  </div>

                  <div className="mt-5 grid gap-4">
                    <Field
                      label="Presentation colour"
                      hint="Used consistently across the public website and every portal."
                    >
                      <div className="flex items-center gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-white px-3 py-2.5">
                        <input
                          name="accentColor"
                          type="color"
                          defaultValue={presentationEditor.accentColor ?? "#18A83B"}
                          className="h-10 w-14 cursor-pointer rounded-[10px] border-0 bg-transparent p-0"
                          aria-label="Presentation colour"
                        />
                        <span className="text-sm text-[color:var(--text-soft)]">
                          {presentationEditor.accentColor ?? "#18A83B"}
                        </span>
                      </div>
                    </Field>
                    <Field
                      label="Year levels"
                      hint="Comma separate multiple groups, e.g. Years 5 to 6, Years 7 to 8, Years 9 to 13 — each shows as its own tag on the website"
                    >
                      <input
                        name="yearLevels"
                        defaultValue={presentationEditor.yearLevels}
                        placeholder="Years 5 to 6, Years 7 to 8"
                        className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)]"
                      />
                    </Field>
                    <Field label="Duration (minutes)">
                      <input
                        name="durationMinutes"
                        type="number"
                        min={1}
                        defaultValue={presentationEditor.durationMinutes}
                        required
                        className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)]"
                      />
                    </Field>
                    <Field label="Delivery format" hint="Comma separated">
                      <input
                        name="deliveryFormats"
                        defaultValue={presentationEditor.deliveryFormats.join(", ")}
                        className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)]"
                      />
                    </Field>
                    <label className="flex items-center gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-3 text-sm text-[color:var(--navy)]">
                      <input type="checkbox" name="isPublic" defaultChecked={presentationEditor.public} />
                      Public — visible on public presentation pages
                    </label>
                  </div>
                </div>

                <div id="presentation-resources" className="scroll-mt-8 rounded-[28px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                    Linked resources
                  </p>
                  <div className="mt-4 grid gap-3">
                    {portal.resources
                      .filter((resource) => resource.presentationTypeId === presentationEditor.id)
                      .slice(0, 4)
                      .map((resource) => (
                        <div
                          key={resource.id}
                          className="rounded-[20px] border border-[color:var(--border-soft)] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)] px-4 py-4"
                        >
                          <p className="font-semibold text-[color:var(--navy)]">{resource.title}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={resource.sharingScope === "public" ? "inline-flex rounded-full bg-[#e8f1fd] px-2.5 py-1 text-xs font-semibold text-[#1e4fae]" : "inline-flex rounded-full bg-[#f1edfd] px-2.5 py-1 text-xs font-semibold text-[#6941c6]"}>
                              {resource.sharingScope === "public" ? "Public" : "Internal"}
                            </span>
                            <span className="text-sm text-[color:var(--text-soft)]">{titleCase(resource.type)}</span>
                          </div>
                        </div>
                      ))}
                    <ButtonLink href="/admin/resources" variant="secondary" className="justify-center">
                      Manage resources
                    </ButtonLink>
                    {presentationEditor.id ? (
                      <ButtonLink
                        href={`/admin/resources/new?presentation=${encodeURIComponent(presentationEditor.id)}`}
                        className="justify-center"
                      >
                        Add presentation material
                      </ButtonLink>
                    ) : null}
                  </div>
                </div>

                <div id="presentation-reviews" className="scroll-mt-8 rounded-[28px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                    Reviews
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                    {
                      portal.schoolReviews.filter(
                        (review) => review.presentationTypeId === presentationEditor.id
                      ).length
                    }{" "}
                    school reviews are linked to this presentation.
                  </p>
                  <ButtonLink href="/admin/feedback" variant="secondary" className="mt-4 justify-center">
                    Open feedback
                  </ButtonLink>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:rgba(4,15,75,0.08)] pt-6 xl:col-span-2">
                <ButtonLink href="/admin/presentations" variant="secondary">
                  Cancel
                </ButtonLink>
                <div className="flex flex-wrap items-center gap-3">
                  <PendingSubmitButton unstyled
                    type="submit"
                    name="intent"
                    value="draft"
                    className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[color:rgba(4,15,75,0.12)] bg-white px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                  >
                    Save Draft
                  </PendingSubmitButton>
                  <PendingSubmitButton unstyled
                    type="submit"
                    name="intent"
                    value="publish"
                    className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#95d2ab] bg-[linear-gradient(135deg,#30b45f,#18a83b)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(24,168,59,0.2)]"
                  >
                    {isCreatingPresentation ? "Create Presentation" : "Update Presentation"}
                  </PendingSubmitButton>
                </div>
              </div>
            </form>
          </Card>
        ) : null}

        {route === "regions" ? (
          <div className="grid gap-4">
            {regionsNotice ? (
              <NoticeBanner tone={regionsNotice.tone}>{regionsNotice.message}</NoticeBanner>
            ) : null}
            <RegionsManager
              regions={portal.regions}
              saveAction={saveRegionAction}
              deleteAction={deleteRegionAction}
            />
          </div>
        ) : null}

        {route === "training" ? (
          <div className="grid gap-4">
            {contentNotice?.scope === "resource" ? (
              <NoticeBanner tone={contentNotice.tone}>{contentNotice.message}</NoticeBanner>
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
              returnTo="/admin/training"
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
            {contentNotice?.scope === "resource" ? (
              <NoticeBanner tone={contentNotice.tone}>{contentNotice.message}</NoticeBanner>
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
              returnTo="/admin/materials"
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
                <ButtonLink href="/admin/resources" variant="secondary">
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

            {contentNotice?.scope === "resource" ? (
              <NoticeBanner tone={contentNotice.tone} className="mx-6 mt-6 md:mx-8">
                {contentNotice.message}
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
                value={isCreatingResource ? "/admin/resources/new" : `/admin/resources/${resourceEditor.id}`}
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

                <Field label="Tags" hint="Comma separated, e.g. wellbeing, parents, year-9">
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
                <ButtonLink href="/admin/resources" variant="secondary">
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

        {route === "pages-content" || route === "homepage" ? (
          <div className="grid gap-5">
            {portal.homepageSections.map((section) => (
              <Card key={section.id} className="rounded-[34px]">
                <SectionHeading kicker={section.sectionKey} title={section.title ?? "Homepage section"} />
                <form action={saveHomepageSectionAction} className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <input type="hidden" name="id" value={section.id} />
                  <input type="hidden" name="existingImageUrl" value={section.imageUrl ?? ""} />
                  <div className="grid gap-4">
                    <Field label="Title">
                      <input name="title" defaultValue={section.title} className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm" />
                    </Field>
                    <Field label="Subtitle">
                      <input name="subtitle" defaultValue={section.subtitle} className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm" />
                    </Field>
                    <Field label="Body">
                      <RichTextEditor
                        name="body"
                        defaultValue={section.body}
                        placeholder="Write homepage content."
                      />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Sort order">
                        <input
                          type="number"
                          name="sortOrder"
                          defaultValue={section.sortOrder}
                          className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                        />
                      </Field>
                      <Field label="Replace image">
                        <input type="file" name="image" accept=".png,.jpg,.jpeg,.webp" className="w-full rounded-[18px] border border-dashed border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm" />
                      </Field>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[color:var(--text-soft)]">
                      <input type="checkbox" name="isActive" defaultChecked={section.isActive} />
                      Section is active
                    </label>
                    <PendingSubmitButton unstyled type="submit" className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)]">
                      Save section
                    </PendingSubmitButton>
                  </div>
                  <div className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                      Current image
                    </p>
                    {section.imageUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={section.imageUrl} alt={section.title ?? section.sectionKey} className="mt-4 h-56 w-full rounded-[20px] object-cover" />
                      </>
                    ) : (
                      <div className="mt-4 flex h-56 items-center justify-center rounded-[20px] border border-dashed border-[color:var(--border-soft)] text-sm text-[color:var(--text-soft)]">
                        No image uploaded
                      </div>
                    )}
                  </div>
                </form>
              </Card>
            ))}
          </div>
        ) : null}

        {route === "email-templates" ? (
          <div className="grid gap-4">
            {getEmailTemplatesNotice(resolvedSearchParams) ? (
              <Card
                className={cn(
                  "rounded-[24px] px-5 py-4 text-sm font-semibold",
                  getEmailTemplatesNotice(resolvedSearchParams)?.tone === "error"
                    ? "border-[#f2c6c6] bg-[#fff6f6] text-[#9d2424]"
                    : "border-[#b9e2c7] bg-[#f4fbf6] text-[#1d6f35]"
                )}
              >
                {getEmailTemplatesNotice(resolvedSearchParams)?.message}
              </Card>
            ) : null}
            <EmailTemplatesWorkspace
              templates={portal.emailTemplates}
              saveAction={saveEmailTemplateAction}
              sendTestAction={sendTestEmailAction}
              createAction={createEmailTemplateAction}
            />
          </div>
        ) : null}

        {route === "audit-logs" ? (
          <DataTable
            title="Audit log"
            columns={["Action", "Entity", "Actor", "When"]}
            rows={portal.auditLogs.map((log) => [
              log.action,
              log.entityType,
              log.actor,
              formatDateTime(log.createdAt)
            ])}
          />
        ) : null}

        {route === "profile" ? (
          <PortalProfileWorkspace
            name={actor.fullName}
            email={actor.email}
            phone={actor.phone}
            avatarUrl={actor.avatarUrl}
            roleLabel="Platform admin"
            returnTo="/admin/profile"
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
                      No unread admin activity.
                    </h2>
                    <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                      Ambassador approval alerts will appear here alongside other future admin notifications.
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
                      <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
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
                      <ButtonLink href={notification.relatedUrl.replace(/^\/staff\//, "/admin/")}>
                        Open review
                      </ButtonLink>
                    ) : null}
                    {!notification.readAt ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <input type="hidden" name="redirectTo" value="/admin/activity" />
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

function getEmailTemplatesNotice(
  searchParams: Record<string, string | string[] | undefined>
): { tone: "success" | "error"; message: string } | null {
  const saved = readSearchParam(searchParams, "saved");
  const error = readSearchParam(searchParams, "error");

  if (saved === "template") {
    return { tone: "success", message: "Template saved. New emails will use this version." };
  }

  if (saved === "template-created") {
    return {
      tone: "success",
      message: "Template created."
    };
  }

  if (error === "template-key-exists") {
    return {
      tone: "error",
      message: "A template with that name already exists — pick a different name."
    };
  }

  if (saved === "test-sent") {
    return { tone: "success", message: "Test email sent — check your inbox (and spam folder)." };
  }

  if (error === "brevo-not-configured") {
    return {
      tone: "error",
      message: "Email sending is temporarily unavailable. Contact the platform administrator."
    };
  }

  if (error === "test-failed") {
    return {
      tone: "error",
      message: "The test email could not be sent. Check the sender settings and try again."
    };
  }

  if (error === "template-not-found") {
    return { tone: "error", message: "That template couldn't be found." };
  }

  return null;
}

function getRegionsNotice(searchParams: Record<string, string | string[] | undefined>) {
  const error = readSearchParam(searchParams, "error");
  const saved = readSearchParam(searchParams, "saved");

  if (error === "invalid-region") {
    return { tone: "error" as const, message: "Enter a region name of at least 2 characters." };
  }

  if (error === "region-exists") {
    return { tone: "error" as const, message: "A region with that name already exists." };
  }

  if (error === "region-in-use") {
    return {
      tone: "error" as const,
      message:
        "That region is used by schools, bookings, or ambassadors, so it can't be deleted. Untick “Active” and save to hide it instead."
    };
  }

  if (error === "region-save-failed" || error === "region-delete-failed") {
    return { tone: "error" as const, message: "Something went wrong — please try again." };
  }

  if (saved === "region") {
    return { tone: "success" as const, message: "Region saved." };
  }

  if (saved === "region-deleted") {
    return { tone: "success" as const, message: "Region deleted." };
  }

  return null;
}

function getUsersNotice(searchParams: Record<string, string | string[] | undefined>) {
  const error = readSearchParam(searchParams, "error");
  const updated = readSearchParam(searchParams, "updated");

  if (error === "invalid-invite") {
    return {
      tone: "error" as const,
      message:
        "Enter a valid name, email, and role before sending the invite. Ambassador invites also need a primary region."
    };
  }

  if (error === "invite-failed") {
    return {
      tone: "error" as const,
      message:
        "The invite could not be sent. Double-check the email — if this person already has an account, change their role from the directory below instead."
    };
  }

  if (error === "invite-ambassador-failed") {
    return {
      tone: "error" as const,
      message:
        "The invite email was sent, but the ambassador profile could not be auto-approved. Approve it manually from the Ambassadors page."
    };
  }

  if (error === "ambassador-sync-failed") {
    return {
      tone: "error" as const,
      message: "The ambassador profile could not be updated for that role change. Please try again."
    };
  }

  if (error === "invalid-delete" || error === "invalid-delete-confirmation") {
    return { tone: "error" as const, message: "Deletion confirmation failed. Type DELETE exactly to remove the user." };
  }

  if (error === "cannot-delete-self") {
    return { tone: "error" as const, message: "Delete another super admin from a different account if this user ever needs removing." };
  }

  if (error === "last-super-admin") {
    return { tone: "error" as const, message: "At least one active super admin must remain on the platform." };
  }

  if (error === "user-not-found") {
    return { tone: "error" as const, message: "That user could not be found anymore." };
  }

  if (error === "delete-failed") {
    return { tone: "error" as const, message: "The user could not be deleted. If they have linked activity, try again or review related records first." };
  }

  if (updated === "role") {
    return { tone: "success" as const, message: "User role updated." };
  }

  if (updated === "status") {
    return { tone: "success" as const, message: "User status updated." };
  }

  if (updated === "access") {
    return { tone: "success" as const, message: "User access updated." };
  }

  if (readSearchParam(searchParams, "invited") === "1") {
    return { tone: "success" as const, message: "Invite sent successfully." };
  }

  if (readSearchParam(searchParams, "deleted") === "1") {
    return { tone: "success" as const, message: "User deleted successfully." };
  }

  return null;
}

function getContentNotice(searchParams: Record<string, string | string[] | undefined>) {
  if (readSearchParam(searchParams, "deleted") === "bookings") {
    const count = Number(readSearchParam(searchParams, "deletedCount")) || 0;
    return {
      scope: "booking" as const,
      tone: "success" as const,
      message: count ? `${count} booking${count === 1 ? "" : "s"} deleted successfully.` : "The selected bookings have already been removed."
    };
  }
  if (["booking-delete-failed", "invalid-booking-deletion"].includes(readSearchParam(searchParams, "error") || "")) {
    return {
      scope: "booking" as const,
      tone: "error" as const,
      message: "The bookings could not be deleted. Select up to 100 bookings and try again."
    };
  }

  if (readSearchParam(searchParams, "created") === "booking") {
    const reference = readSearchParam(searchParams, "reference");
    return {
      scope: "booking" as const,
      tone: "success" as const,
      message: reference ? `Booking logged successfully. Reference: ${reference}.` : "Booking logged successfully."
    };
  }
  if (readSearchParam(searchParams, "error") === "booking-in-progress") {
    return {
      scope: "booking" as const,
      tone: "error" as const,
      message: "This booking is already being saved. Check the booking list before trying again."
    };
  }

  const error = readSearchParam(searchParams, "error");
  const withdrawal = readSearchParam(searchParams, "withdrawal");
  const resolved = readSearchParam(searchParams, "resolved");

  if (resolved === "approve" || resolved === "decline") {
    return {
      scope: "booking" as const,
      tone: "success" as const,
      message:
        resolved === "approve"
          ? "Reschedule approved. The session time and calendar have been updated."
          : "Reschedule declined. The original session time remains in place."
    };
  }

  if (error?.includes("reschedule")) {
    return {
      scope: "booking" as const,
      tone: "error" as const,
      message: "The reschedule could not be resolved. Review the date and time, then try again."
    };
  }

  if (withdrawal === "approved") {
    return {
      scope: "booking" as const,
      tone: "success" as const,
      message: "Withdrawal approved - the session has returned to the open pool."
    };
  }

  if (withdrawal === "declined") {
    return {
      scope: "booking" as const,
      tone: "success" as const,
      message: "Withdrawal declined - the ambassador remains assigned and has been notified."
    };
  }

  if (error === "invalid-withdrawal-resolution") {
    return {
      scope: "booking" as const,
      tone: "error" as const,
      message: "That withdrawal decision was incomplete. Please try again."
    };
  }

  if (error === "no-withdrawal-pending") {
    return {
      scope: "booking" as const,
      tone: "error" as const,
      message: "That withdrawal request has already been resolved or is no longer pending."
    };
  }

  if (error === "invalid-presentation") {
    return { scope: "presentation" as const, tone: "error" as const, message: "Fill in the required presentation fields before saving." };
  }

  if (error === "presentation-upload-failed") {
    return { scope: "presentation" as const, tone: "error" as const, message: "The presentation image upload failed. Check storage configuration or try a different file." };
  }

  if (error === "save-failed") {
    return { scope: "presentation" as const, tone: "error" as const, message: "The presentation could not be saved. Check the slug and try again." };
  }

  if (error === "invalid-resource") {
    return { scope: "resource" as const, tone: "error" as const, message: "Fill in the required resource fields before saving." };
  }

  if (error === "resource-upload-failed") {
    return { scope: "resource" as const, tone: "error" as const, message: "The resource file upload failed. Check storage configuration or try another file." };
  }

  if (error === "resource-save-failed") {
    return { scope: "resource" as const, tone: "error" as const, message: "The resource could not be saved. Review the file and link details, then try again." };
  }

  if (error === "resource-delete-failed") {
    return { scope: "resource" as const, tone: "error" as const, message: "The resource could not be deleted. Please try again." };
  }

  if (error === "invalid-training-pack") {
    return { scope: "resource" as const, tone: "error" as const, message: "Enter a pack name before saving." };
  }

  if (error === "training-pack-save-failed") {
    return { scope: "resource" as const, tone: "error" as const, message: "The training pack could not be created. Please try again." };
  }

  if (error === "training-pack-presentation-in-use") {
    return { scope: "resource" as const, tone: "error" as const, message: "That presentation is already linked to another training pack. Choose a different presentation or leave it unlinked." };
  }

  if (error === "training-pack-storage-missing") {
    return { scope: "resource" as const, tone: "error" as const, message: "Training pack storage has not been installed in this Supabase project. Apply database migrations 0035 and 0036, then try again." };
  }

  if (error === "training-pack-optional-link-pending") {
    return { scope: "resource" as const, tone: "error" as const, message: "Standalone packs need the latest database update before they can be created." };
  }

  if (error === "training-pack-delete-failed") {
    return { scope: "resource" as const, tone: "error" as const, message: "The training pack could not be deleted. Please try again." };
  }

  if (error === "training-pack-not-empty") {
    return { scope: "resource" as const, tone: "error" as const, message: "Delete the resources inside this pack before deleting the pack." };
  }

  if (error === "training-pack-confirmation-mismatch") {
    return { scope: "resource" as const, tone: "error" as const, message: "Type delete to confirm. Nothing was deleted." };
  }

  if (readSearchParam(searchParams, "saved") === "presentation") {
    return { scope: "presentation" as const, tone: "success" as const, message: "Presentation saved successfully." };
  }

  if (readSearchParam(searchParams, "saved") === "resource") {
    return { scope: "resource" as const, tone: "success" as const, message: "Resource saved successfully." };
  }

  if (readSearchParam(searchParams, "saved") === "training-pack") {
    return { scope: "resource" as const, tone: "success" as const, message: "Training pack created successfully." };
  }

  if (readSearchParam(searchParams, "deleted") === "resource") {
    return { scope: "resource" as const, tone: "success" as const, message: "Resource deleted successfully." };
  }

  if (readSearchParam(searchParams, "deleted") === "training-pack") {
    return { scope: "resource" as const, tone: "success" as const, message: "Training pack deleted. The presentation is unchanged." };
  }

  return null;
}

function NoticeBanner({
  tone,
  className,
  children
}: {
  tone: "success" | "error";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-[22px] border px-4 py-3 text-sm font-medium",
        tone === "success"
          ? "border-[#b8e7c6] bg-[#effaf2] text-[#196a34]"
          : "border-[#f0c3c3] bg-[#fff5f5] text-[#9d2424]",
        className
      )}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--navy)]">
          {label}
        </span>
        {hint ? <span className="text-xs text-[color:var(--text-soft)]">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}
