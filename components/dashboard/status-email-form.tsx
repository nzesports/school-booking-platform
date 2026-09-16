"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { statusEmailLabel } from "@/lib/services/status-email-choice";

export function StatusEmailForm({ action, children, className }: {
  action: (data: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const choice = useRef<HTMLInputElement>(null);
  const approved = useRef(false);
  const submitting = useRef(false);
  const [confirmation, setConfirmation] = useState<{ status: string; email: string | null; count: number }>();
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
      setConfirmation({ status: select.selectedOptions[0]?.text || status,
        email: statusEmailLabel(status), count: data.getAll("bookingRequestId").length });
    }}>
      <input ref={choice} type="hidden" name="emailChoice" defaultValue="skip" />
      {children}
    </form>
    {confirmation && createPortal(<BookingDialogShell title="Update booking status" onClose={cancel} compact maxWidthClassName="max-w-[540px]" overlayClassName="z-[100]">
      <p className="mt-3 text-sm">Change {confirmation.count === 1 ? "this booking" : `${confirmation.count} bookings`} to <strong>{confirmation.status}</strong>?</p>
      <p className="mt-3 text-sm">{confirmation.email
        ? `Would you also like to send ${confirmation.email} to the school contact${confirmation.count === 1 ? "" : "s"}? Only sessions whose status changes will be emailed.`
        : "There is no school email for this status. The status will be updated without sending an email."}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {confirmation.email && <Button onClick={() => submit(true)}>Yes, update and email</Button>}
        <Button variant="secondary" onClick={() => submit(false)}>{confirmation.email ? "No, update only" : "Update status"}</Button>
        <Button variant="ghost" onClick={cancel}>Cancel</Button>
      </div>
    </BookingDialogShell>, document.body)}
  </>;
}
