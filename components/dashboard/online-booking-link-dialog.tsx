"use client";

import { Check, Copy, Link2, MonitorPlay, RefreshCw } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

// Staff copy the private online booking link from here to send to schools.
// Super admins can also replace it, which stops the old link working.
export function OnlineBookingLinkDialog({
  url,
  returnTo,
  replaceAction
}: {
  url: string | null;
  returnTo: string;
  // Only passed for super admins.
  replaceAction?: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="border-[#c4dbfb] text-[#1e4fae] shadow-[0_3px_10px_rgba(37,99,235,0.08)]"
      >
        <MonitorPlay className="h-4 w-4" />
        Online booking link
      </Button>

      {open
        ? createPortal(
            <BookingDialogShell
              title="Online booking link"
              description="Online sessions aren't advertised on the website, so only share this link with schools you've arranged an online session with. Bookings arrive as online requests to review; add the video-call link in the booking details before confirming so it goes out in the confirmation email."
              descriptionDisplay="tooltip"
              onClose={() => setOpen(false)}
              compact
              maxWidthClassName="max-w-[560px]"
            >
              <div className="mt-5 flex min-w-0 flex-col gap-3">
                {url ? (
                  <div className="flex min-w-0 items-center gap-2 rounded-[14px] border border-[color:var(--border-soft)] bg-[#f6f9fd] py-1.5 pl-3.5 pr-1.5">
                    <Link2 className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" aria-hidden="true" />
                    <span
                      className="min-w-0 flex-1 truncate text-sm text-[color:var(--navy)]"
                      title={url}
                    >
                      {url}
                    </span>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-[8px] bg-[color:var(--navy)] px-4 py-[9px] text-[12px] font-semibold leading-[16px] text-white transition hover:bg-[#101c56]"
                    >
                      {copied ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <p className="rounded-[14px] bg-[#fff8ea] px-4 py-3 text-sm text-[#7a4a00]">
                    The link isn&apos;t available right now. The server isn&apos;t fully configured.
                  </p>
                )}

                {replaceAction ? (
                  <form
                    action={replaceAction}
                    className="flex items-center gap-1.5"
                    onSubmit={(event) => {
                      if (
                        !window.confirm(
                          "Replace the online booking link? The current link will stop working for everyone it was shared with."
                        )
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <PendingSubmitButton
                      unstyled
                      type="submit"
                      pendingLabel="Replacing..."
                      className="inline-flex items-center text-[color:var(--text-soft)] transition hover:text-[color:var(--navy)]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Replace link
                    </PendingSubmitButton>
                    <InfoTooltip label="Replace link">
                      Use this if the link has been shared too widely. The current link stops
                      working straight away, so send the new one to any schools still booking.
                    </InfoTooltip>
                  </form>
                ) : null}
              </div>
            </BookingDialogShell>,
            document.body
          )
        : null}
    </>
  );
}
