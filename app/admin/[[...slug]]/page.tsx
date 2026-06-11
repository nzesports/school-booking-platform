import type { ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutTemplate,
  Layers3,
  MapPinned,
  Plus,
  School2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users
} from "lucide-react";

import { logoutAction } from "@/app/auth/actions";
import {
  deletePortalUserAction,
  invitePortalUserAction,
  markNotificationReadAction,
  saveEmailTemplateAction,
  saveHomepageSectionAction,
  savePresentationAction,
  saveResourceAction,
  updateUserRoleAction,
  updateUserStatusAction
} from "@/app/portal/actions";
import { OperationsAnalytics } from "@/components/dashboard/operations-analytics";
import {
  BookingLifecyclePanel,
  FeedbackWorkspace,
  SchoolDeliveryDatabase
} from "@/components/dashboard/operations-views";
import { ResourceLibrary } from "@/components/dashboard/resource-library";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
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
  readDashboardRange
} from "@/lib/services/dashboard-insights";
import { getAdminPortalData } from "@/lib/services/portal";
import { cn, formatDateTime, formatShortDate, titleCase } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: SlidersHorizontal },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/schools", label: "Schools", icon: School2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/roles", label: "Roles", icon: ShieldCheck },
  { href: "/admin/presentations", label: "Presentations", icon: Layers3 },
  { href: "/admin/regions", label: "Regions", icon: MapPinned },
  { href: "/admin/feedback", label: "Feedback", icon: Bell },
  { href: "/admin/resources", label: "Resources", icon: FolderKanban },
  { href: "/admin/pages-content", label: "Pages & Content", icon: LayoutTemplate },
  { href: "/admin/email-templates", label: "Email templates", icon: FileText },
  { href: "/admin/audit-logs", label: "Audit logs", icon: ShieldCheck }
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
  const actor = await requirePortalAccess("super_admin");
  const portal = await getAdminPortalData(actor.id);
  const dashboardRange = readDashboardRange(resolvedSearchParams.range);
  const activeBookingView = readBookingLifecycleView(resolvedSearchParams.status);
  const presentationFilterId = readSearchParam(resolvedSearchParams, "presentation") ?? undefined;
  const filteredDashboard = buildFilteredDashboardData(
    portal.bookings,
    portal.reports,
    portal.ambassadors,
    portal.schoolReviews,
    dashboardRange,
    portal.activityLogs
  );
  const composeOpen = readSearchParam(resolvedSearchParams, "compose") === "1";
  const deleteUserId = readSearchParam(resolvedSearchParams, "delete");
  const directoryUsers = portal.users.filter(
    (user) => user.role === "staff" || user.role === "super_admin"
  );
  const selectedDeleteUser = deleteUserId
    ? directoryUsers.find((user) => user.id === deleteUserId)
    : null;
  const usersNotice = route === "users" ? getUsersNotice(resolvedSearchParams) : null;
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
        learningOutcomes: [],
        requiredEquipment: [],
        imageUrl: undefined,
        active: true,
        public: true
      }
    : selectedPresentation;
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
  const contentNotice = getContentNotice(resolvedSearchParams);
  const openApplications = portal.ambassadors.filter((ambassador) => ambassador.status === "applied");
  const presentationPerformance = buildPresentationPerformance(
    portal.presentations,
    portal.bookings,
    portal.reports,
    portal.schoolReviews
  );
  const topPresentationPerformance = [...presentationPerformance].sort(
    (left, right) => right.deliveredCount - left.deliveredCount
  )[0];
  const feedbackReturnTo = presentationFilterId
    ? `/admin/feedback?presentation=${presentationFilterId}`
    : "/admin/feedback";

  const headline =
    route === ""
      ? `Good morning, ${actor.fullName.split(" ")[0]}`
      : route === "bookings"
        ? "Review booking lifecycle and delivery status"
        : route === "schools"
          ? "Track school delivery history and coverage gaps"
          : route === "users"
            ? "Manage live access"
            : route === "roles"
              ? "Review active role coverage"
              : route === "presentations"
                ? "Manage presentation content and visibility"
                : route === "presentations/new"
                  ? "Create a new presentation"
                  : route.startsWith("presentations/")
                    ? "Edit presentation"
                    : route === "regions"
                      ? "Control regional availability"
                      : route === "resources"
                        ? "Manage staff, school, and ambassador resources"
                        : route === "resources/new"
                          ? "Create a new resource"
                          : route.startsWith("resources/")
                            ? "Edit resource content"
                            : route === "pages-content"
                              ? "Update homepage and content blocks"
                              : route === "feedback"
                                ? "Review school and ambassador feedback"
                                : route === "email-templates"
                                  ? "Manage transactional email templates"
                                  : route === "audit-logs"
                                    ? "Review recent admin actions"
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
        subheadline="Control users, roles, content, resources, templates, and approval workflows from one secure operations surface."
        dateLabel={dashboardRangeLabel(dashboardRange)}
        rangeOptions={dashboardRangeOptions.map((option) => ({
          ...option,
          href: `/admin${route ? `/${route}` : ""}?range=${option.value}`
        }))}
        activeRange={dashboardRange}
        activityHref="/admin/activity"
        notificationCount={actor.notificationCount}
        logoutAction={logoutAction}
        profile={{
          name: actor.fullName,
          subtitle: "Platform Admin"
        }}
      >
        {route === "" ? (
          <>
            <OperationsAnalytics
              metrics={filteredDashboard.metrics}
              sourceMetrics={filteredDashboard.sourceMetrics}
              upcomingSessions={filteredDashboard.upcomingSessions}
              reports={filteredDashboard.reports}
              ambassadors={portal.ambassadors}
              sessions={filteredDashboard.sessions}
              calendarHref="/admin/activity"
              calendarActionLabel="View activity"
              feedbackHref="/admin/feedback"
              feedbackActionLabel="Open feedback"
              audienceLabel="platform operations"
              periodLabel={dashboardRangeLabel(dashboardRange)}
            />

            <div className="grid gap-6 2xl:grid-cols-[1.12fr_0.88fr]">
              <Card className="rounded-[34px]">
                <SectionHeading
                  kicker="Content health"
                  title="Presentation catalogue"
                  actionHref="/admin/presentations"
                  actionLabel="Manage"
                />
                <div className="mt-5 grid gap-4">
                  {topPresentationPerformance ? (
                    <div className="rounded-[22px] border border-[color:var(--border-soft)] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] px-4 py-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                        Performance snapshot
                      </p>
                      <p className="mt-2 font-semibold text-[color:var(--navy)]">
                        {topPresentationPerformance.presentation.title}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                        {topPresentationPerformance.deliveredCount} delivered ·{" "}
                        {topPresentationPerformance.reviewCount} school reviews
                      </p>
                    </div>
                  ) : null}
                  {portal.presentations.slice(0, 4).map((presentation) => (
                    <div
                      key={presentation.id}
                      className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[color:var(--navy)]">{presentation.title}</p>
                          <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                            {presentation.yearLevels} · {presentation.durationMinutes} mins
                          </p>
                        </div>
                        <StatusBadge value={presentation.active ? "confirmed" : "cancelled"} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="grid gap-6">
                <Card className="rounded-[34px]">
                  <SectionHeading
                    kicker="Approval queue"
                    title="Operational actions"
                    actionHref="/admin/activity"
                    actionLabel="Open activity"
                  />
                  <div className="mt-5 grid gap-4">
                    <SummaryStat
                      label="Unread activity"
                      value={String(portal.notifications.filter((notification) => !notification.readAt).length)}
                    />
                    <SummaryStat
                      label="Pending ambassador approvals"
                      value={String(openApplications.length)}
                    />
                    <SummaryStat
                      label="Active super admins"
                      value={String(portal.users.filter((user) => user.role === "super_admin" && user.status === "active").length)}
                    />
                  </div>
                  {openApplications[0] ? (
                    <ButtonLink
                      href="/admin/activity"
                      variant="secondary"
                      className="mt-5 justify-center"
                    >
                      Review latest application
                    </ButtonLink>
                  ) : null}
                </Card>

                <Card className="rounded-[34px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)]">
                  <SectionHeading
                    kicker="Platform footprint"
                    title="Live coverage"
                    actionHref="/admin/regions"
                    actionLabel="View regions"
                  />
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <SummaryStat label="Schools in system" value={String(portal.schools.length)} />
                    <SummaryStat
                      label="Resources live"
                      value={String(portal.resources.filter((resource) => resource.isActive).length)}
                    />
                    <SummaryStat
                      label="Email templates"
                      value={String(portal.emailTemplates.length)}
                    />
                    <SummaryStat
                      label="Active regions"
                      value={String(portal.regions.filter((region) => region.isActive).length)}
                    />
                  </div>
                </Card>
              </div>
            </div>

            <div className="grid gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="rounded-[34px]">
                <SectionHeading
                  kicker="Recent audit activity"
                  title="Critical admin changes"
                  actionHref="/admin/audit-logs"
                  actionLabel="View all"
                />
                <div className="mt-5 grid gap-4">
                  {portal.auditLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="rounded-[22px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                    >
                      <p className="font-semibold text-[color:var(--navy)]">{log.action}</p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                        {log.entityType} · {log.actor}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[34px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)]">
                <SectionHeading
                  kicker="FAQ and support"
                  title="Homepage support content"
                  actionHref="/admin/pages-content"
                  actionLabel="Edit content"
                />
                <div className="mt-5 grid gap-4">
                  {portal.faqs.slice(0, 4).map((faq) => (
                    <div key={faq.id}>
                      <p className="font-semibold text-[color:var(--navy)]">{faq.question}</p>
                      <p className="mt-1 text-sm leading-7 text-[color:var(--text-soft)]">
                        {faq.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        ) : null}

        {route === "bookings" ? (
          <BookingLifecyclePanel
            basePath="/admin"
            bookings={filteredDashboard.bookings}
            schools={portal.schools}
            presentations={portal.presentations}
            ambassadors={portal.ambassadors}
            activeView={activeBookingView}
            range={dashboardRange}
          />
        ) : null}

        {route === "schools" ? (
          <SchoolDeliveryDatabase
            schools={portal.schools}
            bookings={portal.bookings}
            regions={portal.regions}
            basePath="/admin"
          />
        ) : null}

        {route === "feedback" ? (
          <FeedbackWorkspace
            reports={filteredDashboard.reports}
            schoolReviews={filteredDashboard.schoolReviews}
            returnTo={feedbackReturnTo}
            presentationFilterId={presentationFilterId}
          />
        ) : null}

        {route === "users" ? (
          <Card className="rounded-[34px]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Live directory
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                  Current staff and admin access
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--text-soft)]">
                  Invite-only internal accounts live here. Super admins can update role and status,
                  and remove users with typed confirmation when needed.
                </p>
              </div>
              <ButtonLink
                href={composeOpen ? "/admin/users" : "/admin/users?compose=1"}
                variant={composeOpen ? "secondary" : "primary"}
                className="min-w-[148px]"
              >
                <Plus className="h-4 w-4" />
                {composeOpen ? "Close" : "Add user"}
              </ButtonLink>
            </div>

            {usersNotice ? (
              <NoticeBanner tone={usersNotice.tone} className="mt-6">
                {usersNotice.message}
              </NoticeBanner>
            ) : null}

            {composeOpen ? (
              <div className="mt-6 rounded-[28px] border border-[color:rgba(4,15,75,0.08)] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                      Invite access
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                      Add staff or another super admin
                    </h3>
                  </div>
                  <ButtonLink href="/admin/users" variant="ghost" className="min-h-[40px] px-3 py-2">
                    Dismiss
                  </ButtonLink>
                </div>
                <form action={invitePortalUserAction} className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_220px_auto]">
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
                    </select>
                  </Field>
                  <div className="grid items-end">
                    <button
                      type="submit"
                      className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)]"
                    >
                      Send invite
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            <div className="mt-6 grid gap-4">
              {directoryUsers.map((user) => {
                const isDeleteOpen = selectedDeleteUser?.id === user.id;
                const isCurrentUser = user.id === actor.id;

                return (
                  <div
                    key={user.id}
                    className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-[color:var(--navy)]">{user.fullName}</p>
                        <p className="mt-1 text-sm text-[color:var(--text-soft)]">{user.email}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                          Joined {user.createdAt ? formatShortDate(user.createdAt) : "recently"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {isCurrentUser ? (
                          <span className="rounded-full bg-[color:var(--blue-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--navy)]">
                            Current user
                          </span>
                        ) : null}
                        <StatusBadge value={user.status === "active" ? "confirmed" : "cancelled"} />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_auto]">
                      <form action={updateUserRoleAction} className="grid gap-2">
                        <input type="hidden" name="userId" value={user.id} />
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--navy)]">
                          Role
                        </label>
                        <div className="flex gap-2">
                          <select
                            name="role"
                            defaultValue={user.role}
                            className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm"
                          >
                            <option value="staff">Staff</option>
                            <option value="super_admin">Super admin</option>
                          </select>
                          <button
                            type="submit"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-[16px] border border-[color:rgba(4,15,75,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--navy)]"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                      <form action={updateUserStatusAction} className="grid gap-2">
                        <input type="hidden" name="userId" value={user.id} />
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--navy)]">
                          Status
                        </label>
                        <div className="flex gap-2">
                          <select
                            name="status"
                            defaultValue={user.status}
                            className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                          <button
                            type="submit"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-[16px] border border-[color:rgba(4,15,75,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--navy)]"
                          >
                            Save
                          </button>
                        </div>
                      </form>
                      <div className="grid items-end">
                        {isCurrentUser ? (
                          <div className="rounded-[18px] border border-[color:var(--border-soft)] bg-[color:var(--blue-soft)] px-4 py-3 text-sm text-[color:var(--text-soft)]">
                            Current account cannot be deleted here.
                          </div>
                        ) : isDeleteOpen ? (
                          <ButtonLink href="/admin/users" variant="secondary" className="min-h-[44px]">
                            Cancel
                          </ButtonLink>
                        ) : (
                          <ButtonLink
                            href={`/admin/users?delete=${user.id}`}
                            variant="danger"
                            className="min-h-[44px]"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </ButtonLink>
                        )}
                      </div>
                    </div>

                    {isDeleteOpen ? (
                      <form
                        action={deletePortalUserAction}
                        className="mt-5 grid gap-4 rounded-[24px] border border-[#f3b4b4] bg-[#fff7f7] p-4"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="returnTo" value="/admin/users" />
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
                          <button
                            type="submit"
                            className="inline-flex min-h-[46px] items-center justify-center rounded-[18px] border border-[#f3b4b4] bg-[#fff0f0] px-5 py-2.5 text-sm font-semibold text-[#9d2424] shadow-[0_10px_24px_rgba(157,36,36,0.1)]"
                          >
                            Permanently delete user
                          </button>
                          <ButtonLink href="/admin/users" variant="secondary" className="min-h-[46px]">
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

        {route === "roles" ? (
          <DataTable
            title="Role coverage"
            columns={["Role", "Description", "Members", "System role"]}
            rows={portal.roles.map((role) => [
              titleCase(role.name),
              role.description,
              String(role.memberCount),
              role.isSystemRole ? "Yes" : "No"
            ])}
          />
        ) : null}

        {route === "presentations" ? (
          <Card className="rounded-[34px]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Presentation catalogue
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                  Presentation types
                </h2>
                <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                  Create new presentation entries, update content, and attach media and resources from
                  one catalogue.
                </p>
              </div>
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

            <div className="mt-6 overflow-hidden rounded-[26px] border border-[color:var(--border-soft)] bg-white/96">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    {["Title", "Year levels", "Duration", "Visibility", "Status", "Edit"].map((heading) => (
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
                  {portal.presentations.map((presentation) => (
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
                        {presentation.public ? "Public" : "Private"}
                      </td>
                      <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4">
                        <StatusBadge value={presentation.active ? "confirmed" : "cancelled"} />
                      </td>
                      <td className="border-b border-[color:rgba(4,15,75,0.06)] px-5 py-4">
                        <ButtonLink
                          href={`/admin/presentations/${presentation.id}`}
                          variant="ghost"
                          className="min-h-[38px] rounded-[14px] px-3 py-1.5"
                        >
                          Edit
                        </ButtonLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              encType="multipart/form-data"
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

                <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                  <Field label="URL slug">
                    <input
                      name="slug"
                      defaultValue={presentationEditor.slug}
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm text-[color:var(--text-dark)]"
                      placeholder="Leave blank to auto-generate from the title"
                    />
                  </Field>
                  <Field label="Content block intro">
                    <input
                      name="contentSnippet"
                      defaultValue={presentationEditor.contentSnippet ?? ""}
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm text-[color:var(--text-dark)]"
                    />
                  </Field>
                </div>

                <Field label="Short Summary">
                  <textarea
                    name="shortSummary"
                    defaultValue={presentationEditor.shortSummary}
                    className="min-h-[7.5rem] w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3.5 text-sm leading-7 text-[color:var(--text-dark)]"
                  />
                </Field>

                <div id="presentation-content" className="scroll-mt-8">
                  <Field label="Full Description">
                    <RichTextEditor
                      name="fullDescription"
                      defaultValue={presentationEditor.fullDescription}
                      placeholder="Describe the full presentation experience."
                    />
                  </Field>
                </div>
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
                    <Field label="Year levels">
                      <input
                        name="yearLevels"
                        defaultValue={presentationEditor.yearLevels}
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
                      Visible on public presentation pages
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
                          <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                            {titleCase(resource.audience)} · {titleCase(resource.type)}
                          </p>
                        </div>
                      ))}
                    <ButtonLink href="/admin/resources" variant="secondary" className="justify-center">
                      Manage resources
                    </ButtonLink>
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
                  <button
                    type="submit"
                    name="intent"
                    value="draft"
                    className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[color:rgba(4,15,75,0.12)] bg-white px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_10px_24px_rgba(11,24,77,0.08)]"
                  >
                    Save Draft
                  </button>
                  <button
                    type="submit"
                    name="intent"
                    value="publish"
                    className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#95d2ab] bg-[linear-gradient(135deg,#30b45f,#18a83b)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(24,168,59,0.2)]"
                  >
                    {isCreatingPresentation ? "Create Presentation" : "Update Presentation"}
                  </button>
                </div>
              </div>
            </form>
          </Card>
        ) : null}

        {route === "regions" ? (
          <DataTable
            title="Regions"
            columns={["Region", "Slug", "Status"]}
            rows={portal.regions.map((region) => [
              region.name,
              region.slug,
              <StatusBadge key={`${region.id}-status`} value={region.isActive ? "confirmed" : "cancelled"} />
            ])}
          />
        ) : null}

        {route === "resources" ? (
          <Card className="rounded-[34px]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Resource library
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                  Library inventory
                </h2>
                <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                  Manage downloads, YouTube embeds, scripts, slide decks, and school or ambassador
                  materials from one content catalogue.
                </p>
              </div>
              <ButtonLink href="/admin/resources/new">
                <Plus className="h-4 w-4" />
                Add resource
              </ButtonLink>
            </div>

            {contentNotice?.scope === "resource" ? (
              <NoticeBanner tone={contentNotice.tone} className="mt-6">
                {contentNotice.message}
              </NoticeBanner>
            ) : null}

            <div className="mt-6">
              <ResourceLibrary resources={portal.resources} editBasePath="/admin/resources" />
            </div>
          </Card>
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

                <Field label="Tags" hint="Comma separated, e.g. wellbeing, parents, year-9">
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
                <ButtonLink href="/admin/resources" variant="secondary">
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
                    <button type="submit" className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)]">
                      Save section
                    </button>
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
          <div className="grid gap-5">
            {portal.emailTemplates.map((template) => (
              <Card key={template.id} className="rounded-[34px]">
                <SectionHeading kicker={template.key} title={template.subject} />
                <form action={saveEmailTemplateAction} className="mt-6 grid gap-4">
                  <input type="hidden" name="id" value={template.id} />
                  <Field label="Subject">
                    <input
                      name="subject"
                      defaultValue={template.subject}
                      className="w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    />
                  </Field>
                  <Field label="HTML body">
                    <RichTextEditor
                      name="bodyHtml"
                      defaultValue={template.bodyHtml ?? ""}
                      placeholder="Write the email body."
                    />
                    <p className="mt-2 text-xs leading-6 text-[color:var(--text-soft)]">
                      Available placeholders include {"{{contactName}}"}, {"{{schoolName}}"},{" "}
                      {"{{bookingId}}"}, {"{{sessionDate}}"}, and {"{{presentationTitle}}"}.
                    </p>
                  </Field>
                  <Field label="Plain text body">
                    <textarea
                      name="bodyText"
                      defaultValue={template.bodyText ?? ""}
                      className="min-h-24 w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm text-[color:var(--text-soft)]">
                    <input type="checkbox" name="isActive" defaultChecked={template.status === "active"} />
                    Template is active
                  </label>
                  <button type="submit" className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[#a2cae3] bg-[#afd5ed] px-5 py-2.5 text-sm font-semibold text-[color:var(--navy)] shadow-[0_12px_28px_rgba(94,134,165,0.18)]">
                    Save template
                  </button>
                </form>
              </Card>
            ))}
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

        {route === "activity" ? (
          <div className="grid gap-4">
            {portal.notifications.length === 0 ? (
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
              portal.notifications.map((notification) => (
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
                      <ButtonLink href={notification.relatedUrl}>Open review</ButtonLink>
                    ) : null}
                    {!notification.readAt ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <input type="hidden" name="redirectTo" value="/admin/activity" />
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

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getUsersNotice(searchParams: Record<string, string | string[] | undefined>) {
  const error = readSearchParam(searchParams, "error");
  const updated = readSearchParam(searchParams, "updated");

  if (error === "invalid-invite") {
    return { tone: "error" as const, message: "Enter a valid name, email, and internal role before sending the invite." };
  }

  if (error === "invite-failed") {
    return { tone: "error" as const, message: "The invite could not be sent. Double-check the email and try again." };
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

  if (readSearchParam(searchParams, "invited") === "1") {
    return { tone: "success" as const, message: "Invite sent successfully." };
  }

  if (readSearchParam(searchParams, "deleted") === "1") {
    return { tone: "success" as const, message: "User deleted successfully." };
  }

  return null;
}

function getContentNotice(searchParams: Record<string, string | string[] | undefined>) {
  const error = readSearchParam(searchParams, "error");

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

  if (readSearchParam(searchParams, "saved") === "presentation") {
    return { scope: "presentation" as const, tone: "success" as const, message: "Presentation saved successfully." };
  }

  if (readSearchParam(searchParams, "saved") === "resource") {
    return { scope: "resource" as const, tone: "success" as const, message: "Resource saved successfully." };
  }

  return null;
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
