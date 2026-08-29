"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function DashboardSidebarDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  const handleDrawerClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a")) {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open navigation"
        aria-controls="dashboard-sidebar"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          "fixed left-4 top-4 z-[60] inline-flex h-12 w-12 items-center justify-center rounded-[16px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] shadow-[0_12px_30px_rgba(11,24,77,0.16)] transition xl:hidden",
          open && "pointer-events-none invisible opacity-0"
        )}
      >
        <Menu className="h-5 w-5" />
      </button>

      <button
        type="button"
        aria-label="Close navigation"
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-[rgba(4,15,75,0.38)] opacity-0 transition-opacity xl:hidden",
          open ? "visible opacity-100" : "pointer-events-none invisible"
        )}
      />

      <div
        id="dashboard-sidebar"
        onClick={handleDrawerClick}
        className={cn(
          "fixed inset-y-0 left-0 z-50 h-dvh w-[min(292px,calc(100vw-3rem))] -translate-x-full transition-[transform,visibility] duration-300 ease-out xl:sticky xl:top-0 xl:z-auto xl:h-screen xl:w-auto xl:translate-x-0",
          open ? "visible translate-x-0" : "invisible xl:visible"
        )}
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] xl:hidden"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </>
  );
}
