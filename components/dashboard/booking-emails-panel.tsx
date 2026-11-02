"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { loadBookingEmailsAction, loadSentEmailContentAction, previewBookingEmailAction, confirmBookingEmailAction } from "@/app/portal/booking-email-actions";
import { formatDateTime } from "@/lib/utils";

type History = Awaited<ReturnType<typeof loadBookingEmailsAction>>;
type Preview = Awaited<ReturnType<typeof previewBookingEmailAction>>;
type SentEmail = Awaited<ReturnType<typeof loadSentEmailContentAction>> & { key: string };

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  failed: "Failed",
  sending: "Sending",
  skipped_unconfigured: "Not sent – email not configured"
};

export function BookingEmailsPanel({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<History>();
  const [preview, setPreview] = useState<Preview>();
  const [notes, setNotes] = useState("");
  const notesId = useId();
  const previewNeedsUpdate = Boolean(preview && preview.notes !== notes);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const [viewing, setViewing] = useState<SentEmail>();
  const [viewError, setViewError] = useState("");
  const [loadingView, setLoadingView] = useState<string>();
  async function view(source: "log" | "send", id: string) {
    const key = `${source}-${id}`;
    if (viewing?.key === key) { setViewing(undefined); return; }
    setLoadingView(key); setViewError("");
    try { setViewing({ ...(await loadSentEmailContentAction(source, id)), key }); }
    catch (cause) { setViewError(cause instanceof Error ? cause.message : "This email could not be loaded."); }
    finally { setLoadingView(undefined); }
  }
  useEffect(() => {
    let active = true;
    loadBookingEmailsAction(sessionId).then(result => { if (active) setData(result); })
      .catch(() => { if (active) setError("Email history could not be loaded. Close and reopen the Emails tab to retry."); });
    return () => { active = false; };
  }, [sessionId]);
  async function run(send: boolean, kind: "status" | "feedback" = "status") {
    if (lock.current || (send && (!preview || previewNeedsUpdate))) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (send && preview) {
        const result = await confirmBookingEmailAction(preview.id);
        setMessage(result.message); setPreview(undefined); setNotes("");
        setData(await loadBookingEmailsAction(sessionId));
      } else setPreview(await previewBookingEmailAction(sessionId, kind, notes));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The email action failed.");
      if (send) {
        setPreview(undefined);
        try { setData(await loadBookingEmailsAction(sessionId)); } catch { /* Preserve the original failure. */ }
      }
    } finally { lock.current = false; setBusy(false); }
  }
  const canCompose = Boolean(data?.available || data?.feedbackAvailable || preview);
  return <div className="space-y-6 py-4">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {!data && !error && <p role="status" className="flex gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Loading emails…</p>}
    {data && <section className="space-y-3 rounded-xl border bg-white p-4">
      <div>
        <h3 className="font-semibold">Send an email to the school</h3>
        <p className="text-xs text-slate-500">
          {canCompose
            ? "Add optional notes, preview the email, then confirm to send it."
            : "No status email is available for this session’s current status."}
        </p>
      </div>
      {data.booking.manual_email_only && <p className="text-xs text-slate-500">{data.booking.import_batch_id ? "Status emails are sent when you update this booking." : "Emails for this booking are sent manually."}</p>}
      {canCompose && <div className="space-y-2">
        <label htmlFor={notesId} className="text-sm font-medium">Notes (optional)</label>
        <Textarea id={notesId} value={notes} onChange={event => setNotes(event.target.value)}
          disabled={busy} maxLength={2000} aria-describedby={`${notesId}-help`} />
        <p id={`${notesId}-help`} className="text-xs text-slate-500">These notes will appear in the email sent to the school. Preview the email to check wording and spelling. {notes.length}/2,000 characters.</p>
      </div>}
      {!preview && (data.available || data.feedbackAvailable) && <div className="flex flex-wrap gap-2">
        {data.available && <Button
          type="button"
          variant="secondary"
          loading={busy}
          pendingLabel="Preparing…"
          onClick={() => void run(false)}
          className="shadow-none"
        >
          Preview email to school
        </Button>}
        {data.feedbackAvailable && <Button
          type="button" variant="secondary" loading={busy} pendingLabel="Preparing…"
          onClick={() => void run(false, "feedback")}
          className="shadow-none"
        >Preview school feedback email</Button>}
      </div>}
      {preview && <div className="space-y-3 rounded-xl border p-3">
        <p className="text-sm"><strong>To:</strong> {preview.recipient}</p>
        <p className="text-sm"><strong>Booking ref:</strong> {preview.reference}</p>
        <p className="text-sm"><strong>Subject:</strong> {preview.subject}</p>
        <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-96 w-full rounded-lg border" />
        {previewNeedsUpdate && <p role="status" className="text-sm text-amber-700">Your notes have changed. Update the preview to check them before sending.</p>}
        <p className="text-sm">Send this email to {preview.recipient}?</p>
        <div className="flex gap-2">
          {previewNeedsUpdate && <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(false, preview.kind)}>Update preview</Button>}
          <Button type="button" disabled={busy || previewNeedsUpdate} onClick={() => void run(true)}>{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Confirm and send</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => { setPreview(undefined); setNotes(""); }}>Cancel</Button>
        </div>
      </div>}
    </section>}
    {data && <section className="space-y-3">
      <div>
        <h3 className="font-semibold">Email history</h3>
        <p className="text-xs text-slate-500">Every email already sent for this session. Click the eye icon to see exactly what was sent.</p>
      </div>
      {data.history.length === 0 && <p className="text-sm text-slate-500">No emails have been sent for this session.</p>}
      {viewError && <p role="alert" className="text-sm text-red-700">{viewError}</p>}
      {data.history.map(item => {
      const key = `${item.source}-${item.id}`;
      return <div key={key} className="rounded-xl border p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium first-letter:uppercase">{item.subject || item.template_key?.replaceAll("_", " ")}</p>
            <p>{item.recipient_email}</p>
            <p>{STATUS_LABELS[item.status] ?? item.status} · {formatDateTime(item.sent_at || item.created_at)}</p>
            {item.error_message && <p className="text-red-700">{item.error_message}</p>}
          </div>
          <button
            type="button"
            onClick={() => void view(item.source, item.id)}
            disabled={!item.has_content || loadingView === key}
            aria-label={viewing?.key === key ? "Hide email" : "View email"}
            title={item.has_content ? (viewing?.key === key ? "Hide email" : "View email") : "Content wasn't saved for this email (only emails sent from now on can be viewed)."}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-[#2563eb] transition hover:bg-[#f4f8fe] disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            {loadingView === key ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {viewing?.key === key && <div className="mt-3 space-y-2 border-t pt-3">
          <p><strong>Subject:</strong> {viewing.subject}</p>
          <p><strong>To:</strong> {viewing.recipient} · {formatDateTime(viewing.sentAt)}</p>
          <iframe title={`Sent email: ${viewing.subject}`} srcDoc={viewing.html} sandbox="" className="h-96 w-full rounded-lg border" />
        </div>}
      </div>;
      })}
    </section>}
  </div>;
}
