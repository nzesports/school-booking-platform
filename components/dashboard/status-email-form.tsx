"use client";

import { useRef, useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
import { createPortal } from "react-dom";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { statusEmailLabel } from "@/lib/services/status-email-choice";

const statusMarkerColours: Record<string, string> = {
  requested: "bg-amber-50 text-amber-800",
  tentative: "bg-slate-100 text-slate-600",
  applied: "bg-blue-50 text-blue-800",
  ambassador_assigned: "bg-violet-50 text-violet-800",
  confirmed: "bg-green-50 text-green-800",
  reschedule_requested: "bg-orange-50 text-orange-800",
  withdrawal_requested: "bg-amber-50 text-amber-800",
  completed_pending_report: "bg-teal-50 text-teal-800",
  report_submitted: "bg-teal-50 text-teal-800",
  payment_pending: "bg-teal-50 text-teal-800",
  paid: "bg-teal-50 text-teal-800",
  closed: "bg-teal-50 text-teal-800",
  cancelled: "bg-red-50 text-red-800",
  declined: "bg-rose-50 text-rose-800"
};

const choiceButtonClassName = "h-10 min-h-[40px] w-full rounded-xl px-3 py-2 text-xs! font-semibold! leading-4! shadow-none";

export function StatusEmailForm({ action, children, className }: {
  action: (data: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const choice = useRef<HTMLInputElement>(null);
  const approved = useRef(false);
  const submitting = useRef(false);
  const [confirmation, setConfirmation] = useState<{ status: string; statusValue: string; email: string | null; count: number }>();
  function cancel() {
    form.current?.reset();
    setConfirmation(undefined);
  }
  function submit(send: boolean) {
    if (!choice.current || submitting.current) return;
    choice.current.value = send ? "send" : "skip";
    approved.current = true;
    setConfirmation(undefined);
    form.current?.requestSubmit();
  }
  return <>
    <form ref={form} action={async data => {
      try { await action(data); } finally { submitting.current = false; }
    }} className={className} onSubmit={event => {
      if (submitting.current) { event.preventDefault(); return; }
      if (approved.current) { approved.current = false; submitting.current = true; return; }
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const status = String(data.get("status") || "");
      const select = event.currentTarget.elements.namedItem("status") as HTMLSelectElement;
      setConfirmation({ status: select.selectedOptions[0]?.text || status, statusValue: status,
        email: statusEmailLabel(status), count: data.getAll("bookingRequestId").length });
    }}>
      <input ref={choice} type="hidden" name="emailChoice" defaultValue="skip" />
      {children}
    </form>
    {confirmation && createPortal(<BookingDialogShell title="Update status" onClose={cancel} compact maxWidthClassName="max-w-[540px]" overlayClassName="z-[100]">
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <span className="text-sm text-slate-600">{confirmation.count === 1 ? "New booking status" : `New status for ${confirmation.count} bookings`}</span>
        <strong className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${statusMarkerColours[confirmation.statusValue] ?? "bg-slate-100 text-slate-700"}`}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
          {confirmation.status}
        </strong>
      </div>
      <div className="mt-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f1fd] text-[#1e4fae]">
          <Mail className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold">{confirmation.email ? "Email the school as well?" : "Update without an email"}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{confirmation.email
            ? `Send ${confirmation.email}, or update the status without emailing.`
            : "No school email is available for this status."}</p>
        </div>
      </div>
      <div className={`mt-6 grid grid-cols-1 gap-2 border-t border-slate-200 pt-4 ${confirmation.email ? "sm:grid-cols-2" : ""}`}>
        {confirmation.email && <Button className={choiceButtonClassName} onClick={() => submit(true)}>Update and email</Button>}
        <Button className={choiceButtonClassName} variant="secondary" onClick={() => submit(false)}>Update only</Button>
      </div>
    </BookingDialogShell>, document.body)}
  </>;
}
