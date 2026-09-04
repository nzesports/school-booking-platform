"use client";

import {
  ChevronDown,
  Headphones,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
  Users
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { initials } from "@/lib/utils";

type DashboardProfile = {
  name: string;
  subtitle: string;
  imageUrl?: string | null;
  imageAlt?: string;
  href?: string;
};

export function DashboardAccountControl({
  profile,
  logoutAction,
  notificationControl,
  auditLogsHref,
  usersHref,
  settingsHref
}: {
  profile: DashboardProfile;
  logoutAction?: (formData: FormData) => void | Promise<void>;
  notificationControl: ReactNode;
  auditLogsHref?: string;
  usersHref?: string;
  settingsHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative grid grid-cols-[minmax(0,1fr)_56px] rounded-[22px] border border-[color:var(--border-soft)] bg-white/95 shadow-[0_12px_30px_rgba(11,24,77,0.08)]"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className="flex min-w-0 items-center gap-3 rounded-l-[21px] px-3 py-3 text-left transition hover:bg-[#f8fbfd]"
      >
        {profile.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.imageUrl}
            alt={profile.imageAlt ?? profile.name}
            className="h-10 w-10 shrink-0 rounded-[13px] border border-[color:var(--border-soft)] bg-white object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[linear-gradient(135deg,var(--navy),#1d327a)] text-xs font-bold text-white">
            {initials(profile.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[color:var(--navy)]">
            {profile.name}
          </span>
          <span className="block truncate text-xs text-[color:var(--text-soft)]">
            {profile.subtitle}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[color:var(--text-soft)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className="flex items-stretch border-l border-[color:var(--border-soft)]">
        {notificationControl}
      </div>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute bottom-[calc(100%+0.6rem)] left-0 right-0 z-[70] overflow-hidden rounded-[18px] border border-[color:var(--border-soft)] bg-white p-1.5 shadow-[0_18px_46px_rgba(11,24,77,0.18)]"
        >
          {profile.href ? (
            <Link
              href={profile.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[#f4f8fc]"
            >
              <UserRound className="h-4 w-4" />
              Profile
            </Link>
          ) : null}
          {settingsHref ? (
            <Link
              href={settingsHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[#f4f8fc]"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          ) : null}
          {usersHref ? (
            <Link
              href={usersHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[#f4f8fc]"
            >
              <Users className="h-4 w-4" />
              Users
            </Link>
          ) : null}
          {auditLogsHref ? (
            <Link
              href={auditLogsHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[#f4f8fc]"
            >
              <ShieldCheck className="h-4 w-4" />
              Audit logs
            </Link>
          ) : null}
          <Link
            href="/contact"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[#f4f8fc]"
          >
            <Headphones className="h-4 w-4" />
            Support
          </Link>
          {logoutAction ? (
            <form action={logoutAction} role="none">
              <button
                type="submit"
                role="menuitem"
                className="flex min-h-11 w-full items-center gap-3 rounded-[13px] px-3 text-sm font-semibold text-[#b42318] transition hover:bg-[#fff4f3]"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </form>
          ) : (
            <Link
              href="/"
              role="menuitem"
              className="flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-sm font-semibold text-[#b42318] transition hover:bg-[#fff4f3]"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
