import {
  FileText,
  Layers3,
  LayoutTemplate,
  MapPinned,
  ShieldCheck,
  SlidersHorizontal,
  Users
} from "lucide-react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DataTable } from "@/components/dashboard/data-table";
import { MetricGrid } from "@/components/dashboard/metric-grid";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  auditLogs,
  emailTemplates,
  faqs,
  presentations,
  regions
} from "@/lib/domain/demo-data";
import type { DashboardMetric } from "@/lib/domain/types";
import { getAdminPortalData } from "@/lib/services/bookings";

const navItems = [
  { href: "/admin", label: "Overview", icon: SlidersHorizontal },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/roles", label: "Roles", icon: ShieldCheck },
  { href: "/admin/presentations", label: "Presentations", icon: Layers3 },
  { href: "/admin/regions", label: "Regions", icon: MapPinned },
  { href: "/admin/homepage", label: "Homepage", icon: LayoutTemplate },
  { href: "/admin/email-templates", label: "Email templates", icon: FileText }
];

export default async function AdminPortalPage({
  params
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const route = slug?.join("/") ?? "";
  const portal = await getAdminPortalData();

  const metrics: DashboardMetric[] = [
    {
      label: "Configured presentations",
      value: String(portal.presentationsCount),
      trend: "Editable and public/private aware",
      detail: "Core commercial catalogue",
      icon: "sparkles",
      tone: "navy"
    },
    {
      label: "Launch regions",
      value: String(regions.length),
      trend: "Reorderable and archivable",
      detail: "Availability and geography controls",
      icon: "map",
      tone: "green"
    },
    {
      label: "Email templates",
      value: String(emailTemplates.length),
      trend: "Brevo ready",
      detail: "Transactional and operational",
      icon: "file",
      tone: "blue"
    },
    {
      label: "Audit events",
      value: String(auditLogs.length),
      trend: "Critical actions captured",
      detail: "Security and governance trail",
      icon: "shield",
      tone: "amber"
    }
  ];

  const headline =
    route === ""
      ? "Good morning, Jordan Lee"
      : route === "presentations"
        ? "Manage presentation types"
        : route === "regions"
          ? "Manage launch regions and availability"
          : route === "homepage"
            ? "Control homepage content blocks"
            : route === "email-templates"
              ? "Manage operational email templates"
              : route === "audit-logs"
                ? "Review audit history"
                : "Platform configuration";

  return (
    <main className="pb-12">
      <DashboardShell
        title="Super Admin"
        role="super_admin"
        navItems={navItems}
        currentPath={`/admin${route ? `/${route}` : ""}`}
        headline={headline}
        subheadline="Control content, roles, regions, templates, and operational rules from one place without breaking the public booking flow."
        dateLabel="Platform status"
        profile={{
          name: "Jordan Lee",
          subtitle: "Platform Admin"
        }}
      >
        {route === "" ? (
          <>
            <MetricGrid metrics={metrics} />

            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="rounded-[34px]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Content health
                </p>
                <div className="mt-5 grid gap-4">
                  {presentations.map((presentation) => (
                    <div
                      key={presentation.id}
                      className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[color:var(--navy)]">
                            {presentation.title}
                          </p>
                          <p className="text-sm text-[color:var(--text-soft)]">
                            {presentation.yearLevels} · {presentation.durationMinutes} mins
                          </p>
                        </div>
                        <StatusBadge value={presentation.active ? "confirmed" : "cancelled"} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[34px]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Platform controls
                </p>
                <div className="mt-5 grid gap-4">
                  <ControlTile
                    title="Homepage sections"
                    copy="Hero, testimonials, FAQ, CTA bands, and content ordering."
                  />
                  <ControlTile
                    title="Regional availability"
                    copy="Launch sequence, coverage, and future regional expansion."
                  />
                  <ControlTile
                    title="Email templates"
                    copy="Operational notifications, reminders, and ambassador comms."
                  />
                  <ControlTile
                    title="Permissions and audit"
                    copy="Role-aware access backed by an audit log for critical actions."
                  />
                </div>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="rounded-[34px]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  Audit activity
                </p>
                <div className="mt-5 grid gap-4">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-[22px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                    >
                      <p className="font-semibold text-[color:var(--navy)]">{log.action}</p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                        {log.entityType} · {log.actor}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--text-soft)]">{log.createdAt}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-[34px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)]">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                  FAQ and support content
                </p>
                <div className="mt-5 grid gap-4">
                  {faqs.map((faq) => (
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

        {route === "presentations" || route.startsWith("presentations/") ? (
          <DataTable
            title="Presentation types"
            columns={["Title", "Year levels", "Duration", "Visibility", "Status"]}
            rows={presentations.map((presentation) => [
              presentation.title,
              presentation.yearLevels,
              `${presentation.durationMinutes} mins`,
              presentation.public ? "Public" : "Private",
              <StatusBadge
                key={`${presentation.id}-status`}
                value={presentation.active ? "confirmed" : "cancelled"}
              />
            ])}
          />
        ) : null}

        {route === "regions" || route === "availability" ? (
          <DataTable
            title="Regions"
            columns={["Region", "Slug", "Status"]}
            rows={regions.map((region) => [
              region.name,
              region.slug,
              <StatusBadge
                key={`${region.id}-status`}
                value={region.isActive ? "confirmed" : "cancelled"}
              />
            ])}
          />
        ) : null}

        {route === "homepage" || route === "faqs" || route === "testimonials" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="rounded-[32px]">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                Homepage sections
              </h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
                Hero, sponsor block, presentation cards, how it works, regions, testimonials,
                gallery, FAQ, and CTA bands are all represented in the schema and route map.
              </p>
            </Card>
            <Card className="rounded-[32px]">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                FAQ items
              </h2>
              <ul className="mt-4 grid gap-3 text-sm text-[color:var(--text-soft)]">
                {faqs.map((faq) => (
                  <li key={faq.id}>• {faq.question}</li>
                ))}
              </ul>
            </Card>
          </div>
        ) : null}

        {route === "email-templates" ? (
          <DataTable
            title="Email templates"
            columns={["Key", "Subject", "Status"]}
            rows={emailTemplates.map((template) => [
              template.key,
              template.subject,
              <StatusBadge
                key={`${template.id}-status`}
                value={template.status === "active" ? "confirmed" : "tentative"}
              />
            ])}
          />
        ) : null}

        {route === "users" || route === "roles" || route === "settings" || route === "exports" ? (
          <Card className="rounded-[34px]">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              Admin management surface
            </h2>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
              These admin routes are scaffolded and ready for the next layer of implementation:
              user management, permission registries, settings forms, export workflows, and
              role-aware mutations backed by audit logging.
            </p>
          </Card>
        ) : null}

        {route === "audit-logs" ? (
          <DataTable
            title="Audit log"
            columns={["Action", "Entity", "Actor", "When"]}
            rows={auditLogs.map((log) => [log.action, log.entityType, log.actor, log.createdAt])}
          />
        ) : null}
      </DashboardShell>
    </main>
  );
}

function ControlTile({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-[22px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]">
      <p className="font-semibold text-[color:var(--navy)]">{title}</p>
      <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">{copy}</p>
    </div>
  );
}
