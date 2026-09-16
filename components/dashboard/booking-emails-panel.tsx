"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadBookingEmailsAction, previewBookingEmailAction, confirmBookingEmailAction } from "@/app/portal/booking-email-actions";

type History = Awaited<ReturnType<typeof loadBookingEmailsAction>>;
type Preview = Awaited<ReturnType<typeof previewBookingEmailAction>>;

export function BookingEmailsPanel({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<History>();
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    loadBookingEmailsAction(sessionId).then(result => { if (active) setData(result); })
      .catch(() => { if (active) setError("Email history could not be loaded. Close and reopen the Emails tab to retry."); });
    return () => { active = false; };
  }, [sessionId]);
  async function run(send: boolean, kind: "status" | "feedback" = "status") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (send && preview) {
        const result = await confirmBookingEmailAction(preview.id);
        setMessage(result.message); setPreview(undefined);
        setData(await loadBookingEmailsAction(sessionId));
      } else setPreview(await previewBookingEmailAction(sessionId, kind));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The email action failed.");
      if (send) {
        setPreview(undefined);
        try { setData(await loadBookingEmailsAction(sessionId)); } catch { /* Preserve the original failure. */ }
      }
    } finally { lock.current = false; setBusy(false); }
  }
  return <div className="space-y-4 py-4">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {!data && !error && <p role="status" className="flex gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Loading emails…</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold">Email history</h3>
      {data?.available && !preview && <Button
        type="button"
        variant="secondary"
        loading={busy}
        pendingLabel="Preparing…"
        onClick={() => void run(false)}
        className="ml-auto min-h-[32px] rounded-lg px-3 py-1 text-xs shadow-none"
      >
        Preview email
      </Button>}
      {data?.feedbackAvailable && !preview && <Button
        type="button" variant="secondary" loading={busy} pendingLabel="Preparing…"
        onClick={() => void run(false, "feedback")}
        className="ml-auto min-h-[32px] rounded-lg px-3 py-1 text-xs shadow-none"
      >Preview school feedback email</Button>}
    </div>
    {data?.booking.manual_email_only && <p className="text-xs text-slate-500">{data.booking.import_batch_id ? "Status emails are sent when you update this booking." : "Emails for this booking are sent manually."}</p>}
    {data && !data.available && !data.feedbackAvailable && <p className="text-sm">No status email is available for this session’s current status.</p>}
    {preview && <section className="space-y-3 rounded-xl border p-3">
      <p className="text-sm"><strong>To:</strong> {preview.recipient}</p>
      <p className="text-sm"><strong>Booking ref:</strong> {preview.reference}</p>
      <p className="text-sm"><strong>Subject:</strong> {preview.subject}</p>
      <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-96 w-full rounded-lg border" />
      <p className="text-sm">Send this email to {preview.recipient}?</p>
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={() => void run(true)}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Confirm and send</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setPreview(undefined)}>Cancel</Button>
      </div>
    </section>}
    {data?.history.length === 0 && <p className="text-sm text-slate-500">No emails have been sent for this session.</p>}
    {data?.history.map(item => <div key={item.id} className="rounded-xl border p-3 text-sm">
      <p className="font-medium">{item.template_key?.replaceAll("_", " ")}</p>
      <p>{item.recipient_email}</p>
      <p>{item.status} · {new Date(item.sent_at || item.created_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })}</p>
      {item.error_message && <p className="text-red-700">{item.error_message}</p>}
    </div>)}
  </div>;
}
