"use client";

import { CalendarPlus2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { SchoolCombobox } from "@/components/dashboard/school-combobox";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { Region, School } from "@/lib/domain/types";

type PresentationOption = {
  id: string;
  title: string;
  durationMinutes: number;
  yearLevels: string;
};

const fieldClassName =
  "w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm text-[color:var(--text-dark)]";

export function AmbassadorManualBookingDialog({
  schools,
  regions,
  presentations,
  action
}: {
  schools: School[];
  regions: Region[];
  presentations: PresentationOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [yearLevels, setYearLevels] = useState("");
  const schoolOptions = useMemo(
    () => [...schools].sort((left, right) => left.name.localeCompare(right.name)),
    [schools]
  );
  const presentationOptions = useMemo(
    () => [...presentations].sort((left, right) => left.title.localeCompare(right.title)),
    [presentations]
  );

  return (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          className="min-h-[46px] rounded-[14px] border-[#c4dbfb] px-4 text-[#1e4fae] shadow-[0_10px_24px_rgba(37,99,235,0.1)]"
        >
          <CalendarPlus2 className="h-4 w-4" />
          Log a booking
        </Button>
      </div>

      {open
        ? createPortal(
            <BookingDialogShell
              title="Log your booking"
              description="Add a booking you arranged directly with a school. You will be assigned automatically and can confirm it straight away."
              onClose={() => setOpen(false)}
              compact
              maxWidthClassName="max-w-[920px]"
            >
              <form action={action} className="mt-7 grid gap-4">
                <input type="hidden" name="returnTo" value="/ambassador/upcoming" />

                <div className="rounded-[18px] border border-[#b9e2c7] bg-[#f4fbf6] px-4 py-3 text-sm leading-6 text-[#1d6f35]">
                  This will be flagged as <strong>Ambassador Booked</strong>. Once the session meets
                  the usual payment requirements, it will pay <strong>$300</strong> instead of the
                  standard <strong>$205</strong> rate.
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <SchoolCombobox schools={schoolOptions} regions={regions} />

                  <Field label="Presentation">
                    <select
                      name="presentationTypeId"
                      required
                      className={fieldClassName}
                      onChange={(event) => {
                        const presentation = presentationOptions.find(
                          (item) => item.id === event.target.value
                        );

                        if (presentation) {
                          setDurationMinutes(presentation.durationMinutes);
                          setYearLevels(presentation.yearLevels);
                        }
                      }}
                    >
                      <option value="">Select a presentation</option>
                      {presentationOptions.map((presentation) => (
                        <option key={presentation.id} value={presentation.id}>
                          {presentation.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Date">
                    <input type="date" name="date" required className={fieldClassName} />
                  </Field>
                  <Field label="Start time">
                    <input type="time" name="startTime" required className={fieldClassName} />
                  </Field>
                  <Field label="Duration (minutes)">
                    <input
                      type="number"
                      name="durationMinutes"
                      min={1}
                      max={480}
                      required
                      value={durationMinutes}
                      onChange={(event) => setDurationMinutes(Number(event.target.value))}
                      className={fieldClassName}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Year groups">
                    <input
                      name="yearLevels"
                      required
                      value={yearLevels}
                      onChange={(event) => setYearLevels(event.target.value)}
                      className={fieldClassName}
                      placeholder="Years 9 to 10"
                    />
                  </Field>
                  <Field label="Expected students">
                    <input
                      type="number"
                      name="expectedStudentCount"
                      min={1}
                      max={10000}
                      required
                      className={fieldClassName}
                      placeholder="120"
                    />
                  </Field>
                </div>

                <Field label="Notes for the team">
                  <textarea
                    name="internalNotes"
                    maxLength={5000}
                    className="min-h-24 w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    placeholder="Add any delivery details or context staff should know."
                  />
                </Field>

                <label className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-4">
                  <input
                    type="checkbox"
                    name="confirmBooking"
                    className="mt-0.5 h-5 w-5 rounded border-[color:var(--border-soft)] accent-[#18a83b]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[color:var(--navy)]">
                      Confirm this booking now
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[color:var(--text-soft)]">
                      Leave this unticked to save it as assigned to you without marking it confirmed.
                    </span>
                  </span>
                </label>

                <div className="flex flex-wrap justify-end gap-3 border-t border-[rgba(4,15,75,0.08)] pt-5">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <PendingSubmitButton
                    type="submit"
                    pendingLabel="Saving booking..."
                    className="bg-[#2563eb] text-white hover:bg-[#1d4fd7]"
                  >
                    Save booking
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
