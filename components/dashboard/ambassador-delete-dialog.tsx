"use client";

import { Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

export function AmbassadorDeleteDialog({
  ambassadorId,
  ambassadorName,
  recordType,
  returnTo,
  action
}: {
  ambassadorId: string;
  ambassadorName: string;
  recordType: "application" | "volunteer";
  returnTo: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const closeDialog = useCallback(() => {
    setOpen(false);
    setConfirmation("");
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    confirmationInputRef.current?.focus();
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [closeDialog, open]);

  return (
    <>
      <Button type="button" variant="danger" className="w-full" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Delete {recordType}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(4,15,75,0.46)] p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-ambassador-title"
        >
          <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-[0_30px_90px_rgba(4,15,75,0.28)] md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b42318]">
                  Permanent action
                </p>
                <h2
                  id="delete-ambassador-title"
                  className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]"
                >
                  Delete {ambassadorName}?
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-full p-2 text-[color:var(--text-soft)] hover:bg-[#f3f5f8]"
                aria-label="Close delete confirmation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-7 text-[color:var(--text-soft)]">
              If this record has no presentation, sourcing, feedback, or payment history, the
              account will be permanently deleted. If operational history exists, the volunteer
              will disappear from the roster and lose access while those records are retained for
              reporting and payment accuracy.
            </p>

            <form action={action} className="mt-6 grid gap-4">
              <input type="hidden" name="ambassadorProfileId" value={ambassadorId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--text-soft)]">
                  Type DELETE to confirm
                </span>
                <input
                  ref={confirmationInputRef}
                  name="confirmationText"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  className="rounded-[16px] border border-[color:var(--border-soft)] px-4 py-3 text-sm"
                />
              </label>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={closeDialog}>
                  Cancel
                </Button>
                <PendingSubmitButton
                  type="submit"
                  variant="danger"
                  pendingLabel="Deleting..."
                  disabled={confirmation !== "DELETE"}
                >
                  Delete record
                </PendingSubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
