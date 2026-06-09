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

import { BrandLockup } from "@/components/site/brand-lockup";
import { cn, initials, titleCase } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

export function DashboardShell({
  title,
  role,
  navItems,
  currentPath,
  headline,
  subheadline,
  dateLabel,
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
  profile?: {
    name: string;
    subtitle: string;
  };
  children: ReactNode;
}) {
  return (
    <div className="site-shell-wide grid gap-6 py-6 xl:grid-cols-[288px_minmax(0,1fr)]">
      <aside className="surface-panel flex min-h-[calc(100vh-96px)] flex-col rounded-[34px] p-5">
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
            const isActive =
              currentPath === item.href || currentPath.startsWith(`${item.href}/`);
            const Icon = item.icon ?? Home;

            return (
              <Link
                key={item.href}
                href={item.href}
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
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--navy),#1d327a)] text-sm font-bold text-white">
                  {initials(profile.name)}
                </div>
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

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold text-[color:var(--text-soft)]"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </Link>
        </div>
      </aside>

      <main className="grid gap-6 py-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="px-2 py-4">
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

          <div className="flex flex-wrap items-center gap-3 px-2 py-4">
            <button
              type="button"
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--border-soft)] bg-white/94 text-[color:var(--navy)] shadow-[0_10px_25px_rgba(11,24,77,0.06)]"
            >
              <Bell className="h-5 w-5" />
            </button>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-[color:var(--border-soft)] bg-white/94 px-5 py-4 text-sm font-semibold text-[color:var(--navy)] shadow-[0_10px_25px_rgba(11,24,77,0.06)]">
              <CalendarRange className="h-5 w-5 text-[color:var(--green)]" />
              {dateLabel ?? "This week"}
              <ChevronDown className="h-4 w-4 text-[color:var(--text-soft)]" />
            </div>
          </div>
        </div>

        <div className="portal-card-grid">{children}</div>
      </main>
    </div>
  );
}
