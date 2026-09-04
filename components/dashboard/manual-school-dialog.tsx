"use client";

import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

const fieldClassName =
  "w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm text-[color:var(--text-dark)]";

export function ManualSchoolDialog({
  regions,
  action,
  returnTo
}: {
  regions: Array<{ id: string; name: string }>;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="min-h-[50px] rounded-[16px] border-[#c4dbfb] bg-[#e8f1fd] px-5 text-[#1e4fae] hover:bg-[#dcebfc]"
      >
        <Plus className="h-4 w-4" />
        Add school
      </Button>

      {open
        ? createPortal(
            <BookingDialogShell
              kicker="Manual entry"
              title="Add a school"
              description="Create the school record and add its primary contact details."
              onClose={() => setOpen(false)}
              maxWidthClassName="max-w-[960px]"
              overlayClassName="z-[90]"
              compact
            >
              <form action={action} className="mt-6 grid gap-4">
                <input type="hidden" name="returnTo" value={returnTo} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="School name">
                    <input
                      name="name"
                      required
                      className={fieldClassName}
                      placeholder="Harbour Secondary College"
                    />
                  </Field>
                  <Field label="Region">
                    <select name="regionId" defaultValue="" className={fieldClassName}>
                      <option value="">Select a region</option>
                      {regions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="City">
                    <input name="city" className={fieldClassName} placeholder="Auckland" />
                  </Field>
                  <Field label="Postcode">
                    <input name="postcode" className={fieldClassName} placeholder="1010" />
                  </Field>
                  <Field label="Roll size">
                    <input
                      type="number"
                      name="rollSize"
                      min={0}
                      className={fieldClassName}
                      placeholder="900"
                    />
                  </Field>
                  <Field label="Website">
                    <input name="website" className={fieldClassName} placeholder="https://school.nz" />
                  </Field>
                </div>

                <Field label="Address">
                  <input name="address" className={fieldClassName} placeholder="Street address" />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Primary contact">
                    <input name="contactName" className={fieldClassName} placeholder="Jules Morgan" />
                  </Field>
                  <Field label="Contact email">
                    <input
                      type="email"
                      name="contactEmail"
                      className={fieldClassName}
                      placeholder="jules@school.nz"
                    />
                  </Field>
                  <Field label="Contact phone">
                    <input
                      name="contactPhone"
                      className={fieldClassName}
                      placeholder="+64 21 000 000"
                    />
                  </Field>
                  <Field label="Position">
                    <input name="contactPosition" className={fieldClassName} placeholder="Careers lead" />
                  </Field>
                </div>

                <Field label="Notes">
                  <textarea
                    name="notes"
                    className="min-h-24 w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    placeholder="Anything useful for future bookings."
                  />
                </Field>

                <div className="mt-2 flex justify-end gap-3 border-t border-[color:var(--border-soft)] pt-5">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <PendingSubmitButton type="submit" pendingLabel="Saving school...">
                    Save school
                  </PendingSubmitButton>
                </div>
              </form>
            </BookingDialogShell>,
            document.body
          )
        : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--navy)]">
        {label}
      </span>
      {children}
    </label>
  );
}
