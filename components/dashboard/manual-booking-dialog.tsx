"use client";

import { CirclePlus, NotebookPen } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import type {
  AmbassadorProfile,
  PresentationType,
  School
} from "@/lib/domain/types";
import type {
  BookingLifecycleView,
  DashboardRange
} from "@/lib/services/dashboard-insights";

const fieldClassName =
  "w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm text-[color:var(--text-dark)]";

export function ManualBookingDialog({
  basePath,
  schools,
  presentations,
  ambassadors,
  activeView,
  range,
  action
}: {
  basePath: string;
  schools: School[];
  presentations: PresentationType[];
  ambassadors: AmbassadorProfile[];
  activeView: BookingLifecycleView;
  range: DashboardRange;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");

  return (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          className="min-h-[46px] rounded-[14px] border-[#c4dbfb] px-4 text-[#1e4fae] shadow-[0_10px_24px_rgba(37,99,235,0.1)]"
        >
          <CirclePlus className="h-4 w-4" />
          Log booking
        </Button>
      </div>

      {open
        ? createPortal(
            <BookingDialogShell
              title="Log booking"
              kicker="Manual entry"
              description="Record a phone booking or an already-delivered session without sending the school through the public form."
              onClose={() => setOpen(false)}
              compact
              maxWidthClassName="max-w-[980px]"
              headerAside={
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-[16px] bg-[color:var(--green-soft)] text-[#117a2e] shadow-[0_12px_26px_rgba(24,168,59,0.16)]">
                  <NotebookPen className="h-5 w-5" />
                </span>
              }
            >
              <form action={action} className="mt-7 grid gap-4">
                <input
                  type="hidden"
                  name="returnTo"
                  value={`${basePath}/bookings?status=${activeView}&range=${range}`}
                />
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="School">
                    <select name="schoolId" required className={fieldClassName}>
                      <option value="">Select a school</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Presentation">
                    <select name="presentationTypeId" required className={fieldClassName}>
                      <option value="">Select a presentation</option>
                      {presentations.map((presentation) => (
                        <option key={presentation.id} value={presentation.id}>
                          {presentation.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid gap-4 lg:grid-cols-4">
                  <Field label="Date">
                    <input type="date" name="date" required className={fieldClassName} />
                  </Field>
                  <Field label="Start time">
                    <input type="time" name="startTime" required className={fieldClassName} />
                  </Field>
                  <Field label="Duration">
                    <input
                      type="number"
                      name="durationMinutes"
                      min={1}
                      defaultValue={45}
                      required
                      className={fieldClassName}
                    />
                  </Field>
                  <Field label="Status">
                    <select name="status" defaultValue="confirmed" className={fieldClassName}>
                      <option value="tentative">Tentative</option>
                      <option value="ambassador_needed">Ambassador needed</option>
                      <option value="ambassador_assigned">Ambassador assigned</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed_pending_report">Delivered, report needed</option>
                      <option value="report_submitted">Delivered, report submitted</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </Field>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <Field label="Year groups">
                    <input
                      name="yearLevels"
                      required
                      className={fieldClassName}
                      placeholder="Years 9 to 10"
                    />
                  </Field>
                  <Field label="Expected students">
                    <input
                      type="number"
                      name="expectedStudentCount"
                      min={1}
                      required
                      className={fieldClassName}
                      placeholder="120"
                    />
                  </Field>
                  <Field label="Actual students">
                    <input
                      type="number"
                      name="actualStudentCount"
                      min={0}
                      className={fieldClassName}
                      placeholder="Optional"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Assigned ambassador">
                    <select name="assignedAmbassadorId" defaultValue="" className={fieldClassName}>
                      <option value="">Unassigned</option>
                      {approvedAmbassadors.map((ambassador) => (
                        <option key={ambassador.id} value={ambassador.id}>
                          {ambassador.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Referred by ambassador">
                    <select name="outreachAmbassadorId" defaultValue="" className={fieldClassName}>
                      <option value="">No ambassador referral</option>
                      {approvedAmbassadors.map((ambassador) => (
                        <option key={ambassador.id} value={ambassador.id}>
                          {ambassador.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Internal notes">
                  <textarea
                    name="internalNotes"
                    className="min-h-24 w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    placeholder="Source, context, delivery notes, or anything staff should know."
                  />
                </Field>

                <div className="flex flex-wrap justify-end gap-3 border-t border-[rgba(4,15,75,0.08)] pt-5">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-[#2563eb] text-white hover:bg-[#1d4fd7]">
                    Save booking
                  </Button>
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
