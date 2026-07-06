import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarRange,
  ChevronDown,
  Headphones,
  Home,
  LogOut,
  type LucideIcon
} from "lucide-react";

import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { BrandLockup } from "@/components/site/brand-lockup";
import type { PortalNotification } from "@/lib/domain/types";
import { cn, initials, titleCase } from "@/lib/utils";

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

export function DashboardShell({
  title,
  role,
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
  };
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen w-full gap-5 px-4 py-4 xl:grid-cols-[292px_minmax(0,1fr)] xl:gap-0 xl:px-0 xl:py-0">
      <aside className="surface-panel flex flex-col rounded-[34px] p-5 xl:min-h-screen xl:rounded-none xl:border-x-0 xl:border-y-0 xl:border-r xl:border-r-[color:var(--border-soft)] xl:bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(246,250,255,0.94))] xl:px-6 xl:py-7 xl:shadow-none">
        <BrandLockup subtitle={`${titleCase(role)} workspace`} />

        <div className="mt-6 rounded-[24px] bg-[linear-gradient(135deg,#ffffff,#eff6ff)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
            {title}
          </p>
          <p className="mt-1 text-sm font-semibold text-[color:var(--navy)]">
            {profile?.subtitle ?? titleCase(role)}
          </p>
        </div>

        <nav className="mt-6 grid gap-2">
          {navItems.map((item) => {
            const isActive = item.href === activeNavHref(navItems, currentPath);
            const Icon = item.icon ?? Home;

            return (
              <Link
                key={item.href}
                href={item.href}
                // Hover-prefetching a portal route triggers a full server
                // render (and database load) per link — navigation is fast
                // enough without it.
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
        </nav>

        <div className="mt-auto grid gap-3 pt-6">
          {profile ? (
            <div className="rounded-[26px] border border-[color:var(--border-soft)] bg-white/95 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]">
              <div className="flex items-center gap-3">
                {profile.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.imageUrl}
                    alt={profile.imageAlt ?? profile.name}
                    className="h-12 w-12 rounded-2xl border border-[color:var(--border-soft)] bg-white object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--navy),#1d327a)] text-sm font-bold text-white">
                    {initials(profile.name)}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-[color:var(--navy)]">{profile.name}</p>
                  <p className="text-sm text-[color:var(--text-soft)]">{profile.subtitle}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[26px] bg-[linear-gradient(135deg,#f5fbff,#f7fdf8)] p-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.06)]">
            <p className="text-sm font-semibold text-[color:var(--navy)]">Need support?</p>
            <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">
              Demo mode is using seeded data while auth and production workflows are wired up.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center gap-2 rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)]"
            >
              <Headphones className="h-4 w-4 text-[color:var(--green)]" />
              Contact support
            </Link>
          </div>

          {logoutAction ? (
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold text-[color:var(--text-soft)]"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </form>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold text-[color:var(--text-soft)]"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Link>
          )}
        </div>
      </aside>

      <main className="grid content-start gap-5 py-1 xl:min-h-screen xl:px-8 xl:py-6 2xl:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="px-2 py-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
              {title}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)] md:text-5xl">
              {headline ?? title}
            </h1>
            {subheadline ? (
              <p className="mt-3 max-w-3xl text-base text-[color:var(--text-soft)]">
                {subheadline}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 px-2 py-2">
            {notifications ? (
              <NotificationsBell
                notifications={notifications}
                markReadAction={markNotificationReadAction}
                currentPath={currentPath}
                viewAllHref={activityHref}
              />
            ) : (
              <Link
                href={activityHref ?? "#"}
                className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--border-soft)] bg-white/94 text-[color:var(--navy)] shadow-[0_10px_25px_rgba(11,24,77,0.06)]"
              >
                <Bell className="h-5 w-5" />
                {notificationCount && notificationCount > 0 ? (
                  <span className="absolute right-3 top-3 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--green)] px-1 text-[10px] font-bold text-white">
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </span>
                ) : null}
              </Link>
            )}
            {/* Only render the range picker when there are actual options —
                a dropdown that changes nothing is just confusing chrome. */}
            {rangeOptions && rangeOptions.length > 0 ? (
              <details className="group relative">
                <summary className="inline-flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-[color:var(--border-soft)] bg-white/94 px-5 py-4 text-sm font-semibold text-[color:var(--navy)] shadow-[0_10px_25px_rgba(11,24,77,0.06)] marker:hidden">
                  <CalendarRange className="h-5 w-5 text-[color:var(--green)]" />
                  {dateLabel ?? "This week"}
                  <ChevronDown className="h-4 w-4 text-[color:var(--text-soft)] transition group-open:rotate-180" />
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-[18px] border border-[color:var(--border-soft)] bg-white/98 p-2 shadow-[0_18px_42px_rgba(11,24,77,0.14)]">
                  {rangeOptions.map((option) => (
                    <Link
                      key={option.value}
                      href={option.href}
                      className={cn(
                        "flex rounded-[14px] px-3 py-2 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[color:var(--blue-soft)]",
                        option.value === activeRange ? "bg-[color:var(--green-soft)] text-[color:var(--green)]" : ""
                      )}
                    >
                      {option.label}
                    </Link>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
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
