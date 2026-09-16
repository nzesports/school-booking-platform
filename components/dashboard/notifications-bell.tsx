"use client";

import { updateNotificationAction } from "@/app/portal/notification-actions";
import { Bell, CircleCheck, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import type { PortalNotification } from "@/lib/domain/types";
import { cn, formatDateTime } from "@/lib/utils";

function notificationPanelStyle(button: HTMLButtonElement): CSSProperties {
  const rect = button.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(430, viewportWidth - 24);
  const rightSideLeft = rect.right + 12;
  const opensToRight = rightSideLeft + width <= viewportWidth - 12;
  const left = opensToRight
    ? rightSideLeft
    : Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
  const bottom = opensToRight
    ? Math.max(12, viewportHeight - rect.bottom)
    : Math.max(12, viewportHeight - rect.top + 12);

  return {
    bottom,
    left,
    maxHeight: Math.max(220, Math.min(640, viewportHeight - bottom - 12)),
    width
  };
}

// Update notifications in place without closing the panel or redirecting.
export function NotificationsBell({
  notifications,
  markReadAction,
  currentPath,
  viewAllHref,
  buttonClassName
}: {
  notifications: PortalNotification[];
  markReadAction?: (formData: FormData) => void | Promise<void>;
  currentPath: string;
  viewAllHref?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const busyRef = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const visibleNotifications = notifications
    .filter((notification) => !dismissedIds.includes(notification.id))
    .map((notification) => readIds.includes(notification.id)
      ? { ...notification, readAt: notification.readAt ?? "read" }
      : notification);
  const unread = visibleNotifications.filter((notification) => !notification.readAt);

  const updateNotification = async (id: string, intent: "read" | "dismiss") => {
    if (busyRef.current.has(id)) return;
    busyRef.current.add(id);
    setBusyIds((ids) => [...ids, id]);
    setError(null);
    try {
      const result = await updateNotificationAction(id, intent);
      if (result.error) {
        setError(result.error);
      } else if (intent === "dismiss") {
        setDismissedIds((ids) => [...ids, id]);
      } else {
        setReadIds((ids) => [...ids, id]);
      }
    } catch {
      setError("Could not update this notification. Please retry.");
    } finally {
      busyRef.current.delete(id);
      setBusyIds((ids) => ids.filter((value) => value !== id));
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      if (buttonRef.current) {
        setPanelStyle(notificationPanelStyle(buttonRef.current));
      }
    };

    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [open]);

  // Staff-targeted notification links are stored with /staff/ paths; admins
  // should stay inside their own portal.
  const resolveUrl = (url: string) =>
    currentPath.startsWith("/admin") ? url.replace(/^\/staff\//, "/admin/") : url;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }

          if (buttonRef.current) {
            setPanelStyle(notificationPanelStyle(buttonRef.current));
          }
          setOpen(true);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unread.length > 0 ? `Notifications (${unread.length} unread)` : "Notifications"
        }
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--border-soft)] bg-white/94 text-[color:var(--navy)] shadow-[0_10px_25px_rgba(11,24,77,0.06)] transition hover:bg-white",
          buttonClassName
        )}
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 ? (
          <span className="absolute right-3 top-3 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--green)] px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </button>

      {/* Portalled to <body> so glassy card ancestors (backdrop-filter) can't
          trap the fixed panel inside their own bounds. */}
      {open
        ? createPortal(
            <div className="fixed inset-0 z-[70]" role="presentation">
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setOpen(false)}
                className="absolute inset-0 cursor-default bg-transparent"
              />
              <div
                role="dialog"
                aria-label="Notifications"
                style={panelStyle}
                className="absolute flex flex-col overflow-hidden rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(247,250,252,0.99))] shadow-[0_30px_70px_rgba(11,24,77,0.24)]"
              >
                <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-soft)] px-5 py-4">
                  <p className="flex items-center gap-2.5 text-base font-semibold tracking-[-0.01em] text-[color:var(--navy)]">
                    <Bell className="h-4 w-4 text-[color:var(--green)]" />
                    Notifications
                    {unread.length > 0 ? (
                      <span className="rounded-full bg-[color:var(--green-soft)] px-2 py-0.5 text-xs font-bold text-[#117a2e]">
                        {unread.length} new
                      </span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close notifications"
                    className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:bg-[#f6f9fd]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {error ? <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
                  {visibleNotifications.length === 0 ? (
                    <div className="grid justify-items-center gap-2 px-4 py-10 text-center">
                      <CircleCheck className="h-10 w-10 text-[#95d2ab]" />
                      <p className="text-sm font-semibold text-[color:var(--navy)]">
                        You&apos;re all caught up
                      </p>
                      <p className="text-sm text-[color:var(--text-soft)]">
                        New activity will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {visibleNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={cn(
                            "relative rounded-[16px] border px-4 py-3.5 transition hover:border-slate-300",
                            notification.readAt
                              ? "border-[color:var(--border-soft)] bg-white/70"
                              : "border-[rgba(24,168,59,0.25)] bg-[#f7fdf9]"
                          )}
                        >
                          {notification.relatedUrl ? (
                            <Link
                              href={resolveUrl(notification.relatedUrl)}
                              onClick={() => {
                                if (!notification.readAt) void updateNotification(notification.id, "read");
                                setOpen(false);
                              }}
                              aria-label={"Open " + notification.title}
                              className="absolute inset-0 rounded-[16px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#117a2e]"
                            />
                          ) : null}
                          <button
                            type="button"
                            aria-label={"Dismiss " + notification.title}
                            title="Dismiss notification"
                            disabled={busyIds.includes(notification.id)}
                            onClick={() => void updateNotification(notification.id, "dismiss")}
                            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                          >
                            {busyIds.includes(notification.id) ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                          </button>
                          <div className="pointer-events-none flex items-start gap-2.5 pr-6">
                            {!notification.readAt ? (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--green)]" />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-5 text-[color:var(--navy)]">
                                {notification.title}
                              </p>
                              {notification.body ? (
                                <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">
                                  {notification.body}
                                </p>
                              ) : null}
                              <p className="mt-1.5 text-xs font-medium text-[color:var(--text-soft)]">
                                {formatDateTime(notification.createdAt)}
                              </p>
                            </div>
                          </div>
                          {!notification.readAt && markReadAction ? (
                            <button
                              type="button"
                              disabled={busyIds.includes(notification.id)}
                              onClick={() => void updateNotification(notification.id, "read")}
                              className="relative z-10 mt-2 inline-flex min-h-[28px] items-center gap-1 rounded-md px-1 text-xs! font-medium! text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                            >
                              <CircleCheck className="h-3 w-3" />
                              Mark as read
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {viewAllHref ? (
                  <div className="border-t border-[color:var(--border-soft)] p-3">
                    <Link
                      href={viewAllHref}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[40px] items-center justify-center rounded-[13px] bg-[#f6f9fd] text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[#eef4fd]"
                    >
                      View all activity
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
