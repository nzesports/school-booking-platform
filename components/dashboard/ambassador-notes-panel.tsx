import { LockKeyhole, MessageSquare, Reply, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { AmbassadorNote } from "@/lib/services/ambassador-notes";
import { cn, formatDateTime, initials } from "@/lib/utils";

type NotesPanelProps = {
  ambassadorProfileId: string;
  notes: AmbassadorNote[];
  returnTo: string;
  currentUserId: string;
  canDeleteAny: boolean;
  error?: string;
  addAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
};

const textareaClassName =
  "w-full resize-y rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm leading-6 text-[color:var(--text-dark)] outline-none transition focus:border-[color:rgba(24,168,59,0.34)] focus:ring-4 focus:ring-[rgba(24,168,59,0.1)]";

export function AmbassadorNotesPanel({
  ambassadorProfileId,
  notes,
  returnTo,
  currentUserId,
  canDeleteAny,
  error,
  addAction,
  deleteAction
}: NotesPanelProps) {
  const noteCount = notes.reduce((total, note) => total + 1 + note.replies.length, 0);

  return (
    <Card className="rounded-[28px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">Internal</p>
          <h3 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
            Staff notes
            <InfoTooltip label="Staff notes">
              A shared space for staff and super admins to record and discuss anything about this ambassador, such as feedback to follow up. Reply under a note to keep a conversation together.
            </InfoTooltip>
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-soft)] bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)]">
          <LockKeyhole className="h-3.5 w-3.5 text-[color:var(--text-soft)]" aria-hidden="true" />
          Staff only · the ambassador can&apos;t see these
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-[14px] border border-[#f3b4b4] bg-[#fff6f6] px-4 py-3 text-sm text-[#9d2424]">
          {error === "note-delete-failed"
            ? "That note couldn't be deleted. You can only delete your own notes."
            : error === "note-invalid"
              ? "Write something before posting (up to 4,000 characters)."
              : "The note couldn't be saved. Please try again."}
        </p>
      ) : null}

      {/* Keyed on the count so the textarea clears after a successful post. */}
      <form key={`new-note-${noteCount}`} action={addAction} className="mt-5 grid gap-3">
        <input type="hidden" name="ambassadorProfileId" value={ambassadorProfileId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="sr-only" htmlFor="new-ambassador-note">
          New staff note
        </label>
        <textarea
          id="new-ambassador-note"
          name="body"
          required
          maxLength={4000}
          rows={3}
          placeholder="Add a note for the team, e.g. school feedback to follow up on"
          className={textareaClassName}
        />
        <div className="flex justify-end">
          <PendingSubmitButton type="submit" pendingLabel="Posting…" className="min-h-[42px] rounded-[14px] px-5">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Post note
          </PendingSubmitButton>
        </div>
      </form>

      {notes.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-[20px] bg-[#f6f8fb] px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-[color:var(--text-soft)]">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-semibold text-[color:var(--navy)]">No notes yet</p>
        </div>
      ) : (
        <ol className="mt-6 grid gap-4">
          {notes.map((note) => (
            <li key={note.id} className="rounded-[20px] border border-[color:var(--border-soft)] bg-white p-4 sm:p-5">
              <NoteBody
                note={note}
                returnTo={returnTo}
                canDelete={canDeleteAny || note.authorId === currentUserId}
                deleteAction={deleteAction}
              />

              {note.replies.length > 0 ? (
                <ol className="mt-4 grid gap-3 border-l-2 border-[#e3eaf3] pl-4 sm:ml-4">
                  {note.replies.map((reply) => (
                    <li key={reply.id}>
                      <NoteBody
                        note={reply}
                        returnTo={returnTo}
                        canDelete={canDeleteAny || reply.authorId === currentUserId}
                        deleteAction={deleteAction}
                        compact
                      />
                    </li>
                  ))}
                </ol>
              ) : null}

              <details className="group mt-3 sm:ml-12">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-[10px] px-2 py-1 text-xs font-semibold text-[#1e4fae] hover:bg-[#f4f8ff] [&::-webkit-details-marker]:hidden">
                  <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                  Reply
                </summary>
                <form key={`reply-${note.id}-${note.replies.length}`} action={addAction} className="mt-2 grid gap-2">
                  <input type="hidden" name="ambassadorProfileId" value={ambassadorProfileId} />
                  <input type="hidden" name="parentId" value={note.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <label className="sr-only" htmlFor={`reply-${note.id}`}>
                    Reply to {note.authorName}
                  </label>
                  <textarea
                    id={`reply-${note.id}`}
                    name="body"
                    required
                    maxLength={4000}
                    rows={2}
                    placeholder="Write a reply"
                    className={textareaClassName}
                  />
                  <div className="flex justify-end">
                    <PendingSubmitButton type="submit" variant="secondary" pendingLabel="Replying…" className="min-h-[36px] rounded-[12px] px-4 text-xs!">
                      Reply
                    </PendingSubmitButton>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function NoteBody({
  note,
  returnTo,
  canDelete,
  deleteAction,
  compact = false
}: {
  note: AmbassadorNote;
  returnTo: string;
  canDelete: boolean;
  deleteAction: (formData: FormData) => void | Promise<void>;
  compact?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#cfeaf8,#dff3e5)] font-semibold text-[color:var(--navy)]",
          compact ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs"
        )}
      >
        {initials(note.authorName) || "S"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm">
            <span className="font-semibold text-[color:var(--navy)]">{note.authorName}</span>
            <span className="ml-2 text-xs text-[color:var(--text-soft)]">{formatDateTime(note.createdAt)}</span>
          </p>
          {canDelete ? (
            <details className="relative">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-[10px] px-2 py-1 text-xs font-semibold text-[color:var(--text-soft)] hover:bg-[#fff0f0] hover:text-[#9d2424] [&::-webkit-details-marker]:hidden">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </summary>
              <form action={deleteAction} className="absolute right-0 top-full z-10 mt-1 w-56 rounded-[14px] border border-[color:var(--border-soft)] bg-white p-3 shadow-[0_14px_34px_rgba(11,24,77,0.14)]">
                <input type="hidden" name="noteId" value={note.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <p className="text-xs text-[color:var(--text-dark)]">
                  {note.replies.length > 0 ? "Delete this note and its replies?" : "Delete this note?"}
                </p>
                <PendingSubmitButton type="submit" variant="danger" pendingLabel="Deleting…" className="mt-2 min-h-[32px] w-full rounded-[10px] text-xs!">
                  Delete note
                </PendingSubmitButton>
              </form>
            </details>
          ) : null}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--text-dark)]">{note.body}</p>
      </div>
    </div>
  );
}
