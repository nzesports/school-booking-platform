"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { sendFinancePaymentEmailAction } from "@/app/portal/actions";
import { cn } from "@/lib/utils";

type Notice = { tone: "success" | "error"; message: string };
type Toast = Notice & { id: number };

const ShowToastContext = createContext<(notice: Notice) => void>(() => {});

// Payments-page messages appear as a toast pinned to the bottom of the screen
// instead of a card at the top, so acting on a row never scrolls the page.
// The provider sits above the rows, so the toast survives a row moving to
// another section once the page refreshes.
export function PaymentsToastProvider({
  initialNotice,
  children
}: {
  initialNotice?: Notice | null;
  children: ReactNode;
}) {
  const [toast, setToast] = useState<Toast | null>(initialNotice ? { ...initialNotice, id: 0 } : null);
  const [seenNotice, setSeenNotice] = useState(initialNotice);

  // A redirect back to this page (e.g. after approving a report) brings a new
  // URL notice; show it without remounting.
  if (initialNotice !== seenNotice) {
    setSeenNotice(initialNotice);
    if (initialNotice && initialNotice.message !== seenNotice?.message) {
      setToast({ ...initialNotice, id: (toast?.id ?? 0) + 1 });
    }
  }

  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ShowToastContext.Provider value={(notice) => setToast((current) => ({ ...notice, id: (current?.id ?? 0) + 1 }))}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4" aria-live="polite">
        {toast ? (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-[520px] items-start gap-3 rounded-[16px] border px-4 py-3 text-sm font-semibold shadow-[0_18px_40px_rgba(4,15,75,0.18)]",
              toast.tone === "error"
                ? "border-[#f2c6c6] bg-[#fff6f6] text-[#9d2424]"
                : "border-[#b9e2c7] bg-[#f4fbf6] text-[#1d6f35]"
            )}
          >
            {toast.tone === "error" ? (
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p className="min-w-0 flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss message"
              className="-m-1 rounded-md p-1 opacity-70 transition hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </ShowToastContext.Provider>
  );
}

// Send / Resend to finance without a page navigation. The result is pushed to
// the provider (not kept here) because a successful send moves the row, which
// unmounts this form.
export function SendToFinanceForm({
  paymentId,
  className,
  children
}: {
  paymentId: string;
  className?: string;
  children: ReactNode;
}) {
  const showToast = useContext(ShowToastContext);

  return (
    <form
      className={className}
      action={async (formData) => {
        try {
          showToast(await sendFinancePaymentEmailAction(formData));
        } catch (error) {
          // Let a sign-in redirect (expired session) through.
          const digest = (error as { digest?: unknown } | null)?.digest;
          if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw error;
          showToast({ tone: "error", message: "The payment could not be updated. Please try again." });
        }
      }}
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      {children}
    </form>
  );
}
