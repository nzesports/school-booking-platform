import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  Headphones,
  Home,
  type LucideIcon
} from "lucide-react";

import { DashboardAccountControl } from "@/components/dashboard/dashboard-account-control";
import { DashboardRangePicker } from "@/components/dashboard/dashboard-range-picker";
import { DashboardSidebarDrawer } from "@/components/dashboard/dashboard-sidebar-drawer";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { BrandLockup } from "@/components/site/brand-lockup";
import type { PortalNotification } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

// Highlight only the deepest matching item, so the dashboard root ("/staff")
// doesn't stay lit while a child route like "/staff/bookings" is open.
function activeNavHref(navItems: NavItem[], currentPath: string) {
  return navItems.reduce<string | null>((best, candidate) => {
    const matches =
      currentPath === candidate.href || currentPath.startsWith(`${candidate.href}/`);

    if (!matches) {
      return best;
    }

    return !best || candidate.href.length > best.length ? candidate.href : best;
  }, null);
}

function DashboardNavLinks({
  navItems,
  currentPath,
  className
}: {
  navItems: NavItem[];
  currentPath: string;
  className?: string;
}) {
  const activeHref = activeNavHref(navItems, currentPath);

  return (
    <nav className={cn("grid gap-2", className)}>
      {navItems.map((item) => {
        const isActive = item.href === activeHref;
        const Icon = item.icon ?? Home;

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={cn(
              "flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm font-medium transition",
              isActive
                ? "bg-[linear-gradient(90deg,rgba(24,168,59,0.12),rgba(24,168,59,0.06))] text-[color:var(--green)] shadow-[inset_0_0_0_1px_rgba(24,168,59,0.08)]"
                : "text-[color:var(--navy)] hover:bg-[color:var(--blue-soft)]"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
      <a
        href="mailto:schools@esf.nz"
        className="flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm font-medium text-[color:var(--navy)] transition hover:bg-[color:var(--blue-soft)]"
      >
        <Headphones className="h-4 w-4" />
        Support
      </a>
    </nav>
  );
}

export function DashboardShell({
  title,
  navItems,
  currentPath,
  headline,
  subheadline,
  dateLabel,
  rangeOptions,
  activeRange,
  activityHref,
  notificationCount,
  notifications,
  markNotificationReadAction,
  logoutAction,
  profile,
  children
}: {
  title: string;
  role: string;
  navItems: NavItem[];
  currentPath: string;
  headline?: string;
  subheadline?: string;
  dateLabel?: string;
  rangeOptions?: Array<{ href: string; label: string; value: string }>;
  activeRange?: string;
  activityHref?: string;
  notificationCount?: number;
  notifications?: PortalNotification[];
  markNotificationReadAction?: (formData: FormData) => void | Promise<void>;
  logoutAction?: (formData: FormData) => void | Promise<void>;
  profile?: {
    name: string;
    subtitle: string;
    imageUrl?: string | null;
    imageAlt?: string;
    href?: string;
  };
  children: ReactNode;
}) {
  const notificationControl = notifications ? (
    <NotificationsBell
      notifications={notifications}
      markReadAction={markNotificationReadAction}
      currentPath={currentPath}
      viewAllHref={activityHref}
      buttonClassName="h-full min-h-[64px] w-full rounded-none rounded-r-[21px] border-0 bg-transparent shadow-none"
    />
  ) : (
    <Link
      href={activityHref ?? "#"}
      aria-label={
        notificationCount && notificationCount > 0
          ? `Notifications (${notificationCount} unread)`
          : "Notifications"
      }
      className="relative flex min-h-[64px] w-full items-center justify-center rounded-r-[21px] text-[color:var(--navy)] transition hover:bg-[#f8fbfd]"
    >
      <Bell className="h-5 w-5" />
      {notificationCount && notificationCount > 0 ? (
        <span className="absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--green)] px-1 text-[10px] font-bold text-white">
          {notificationCount > 9 ? "9+" : notificationCount}
        </span>
      ) : null}
    </Link>
  );

  return (
    <div className="grid min-h-screen w-full gap-5 px-4 py-4 xl:grid-cols-[292px_minmax(0,1fr)] xl:gap-0 xl:px-0 xl:py-0">
      <DashboardSidebarDrawer>
        <aside className="surface-panel flex h-full min-h-0 flex-col overflow-hidden rounded-r-[30px] border-y-0 border-l-0 border-r border-r-[color:var(--border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,250,255,0.98))] px-5 py-6 shadow-[0_24px_60px_rgba(11,24,77,0.18)] xl:rounded-none xl:px-6 xl:py-7 xl:shadow-none">
          <div className="pr-12 xl:pr-0">
            <BrandLockup compact />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <DashboardNavLinks navItems={navItems} currentPath={currentPath} className="mt-6" />
          </div>

          <div className="shrink-0 pt-6">
            {profile ? (
              <DashboardAccountControl
                profile={profile}
                logoutAction={logoutAction}
                notificationControl={notificationControl}
              />
            ) : (
              <div className="ml-auto w-14">{notificationControl}</div>
            )}
          </div>
        </aside>
      </DashboardSidebarDrawer>

      <main className="grid content-start gap-5 pb-1 pt-16 xl:min-h-screen xl:px-8 xl:py-6 2xl:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="px-2 py-2">
            {headline && headline !== title ? (
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
                {title}
              </p>
            ) : null}
            <h1
              className={cn(
                "text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)] md:text-5xl",
                headline && headline !== title && "mt-2"
              )}
            >
              {headline ?? title}
            </h1>
            {subheadline ? (
              <p className="mt-3 max-w-3xl text-base text-[color:var(--text-soft)]">
                {subheadline}
              </p>
            ) : null}
          </div>

          {rangeOptions && rangeOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 px-2 py-2">
              <DashboardRangePicker
                label={dateLabel ?? "This week"}
                options={rangeOptions}
                activeRange={activeRange}
              />
            </div>
          ) : null}
        </div>

        <div className="portal-card-grid">{children}</div>

        <div className="mt-3 border-t border-[rgba(4,15,75,0.08)] px-2 pt-4 text-xs leading-6 text-[color:var(--text-soft)]">
          <p>
            &copy; 2026{" "}
            <a
              href="https://www.nzesports.org.nz/"
              className="font-semibold text-[color:var(--navy)] underline-offset-4 transition hover:text-[color:var(--green)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              NZ Esports
            </a>
            . All rights reserved.{" "}
            <a
              href="https://www.nzesports.org.nz/privacypolicy/"
              className="font-semibold text-[color:var(--navy)] underline-offset-4 transition hover:text-[color:var(--green)] hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
