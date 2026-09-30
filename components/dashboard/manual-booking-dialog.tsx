"use client";

import {
  Briefcase,
  CalendarDays,
  CirclePlus,
  Clock3,
  GraduationCap,
  Handshake,
  Leaf,
  ListChecks,
  Mail,
  Phone,
  School2,
  StickyNote,
  Timer,
  UserCheck,
  UserRound,
  UserRoundCheck,
  UsersRound
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { RequiredMark, SchoolCombobox } from "@/components/dashboard/school-combobox";
import { Button } from "@/components/ui/button";
import type {
  AmbassadorProfile,
  PresentationType,
  Region,
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
  regions,
  presentations,
  ambassadors,
  activeView,
  range,
  action
}: {
  basePath: string;
  schools: School[];
  regions: Region[];
  presentations: PresentationType[];
  ambassadors: AmbassadorProfile[];
  activeView: BookingLifecycleView;
  range: DashboardRange;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [submissionId, setSubmissionId] = useState("");
  const [recordOnly, setRecordOnly] = useState(false);
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");

  return (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => { setSubmissionId(crypto.randomUUID()); setRecordOnly(false); setOpen(true); }}
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
              onClose={() => setOpen(false)}
              compact
              maxWidthClassName="max-w-[980px]"
            >
              <form action={action} className="mt-5 grid gap-4">
                <p className="-mt-2 text-xs text-[color:var(--text-soft)]">
                  Fields marked <RequiredMark /> are required.
                </p>
                <input type="hidden" name="submissionId" value={submissionId} />
                <input
                  type="hidden"
                  name="returnTo"
                  value={`${basePath}/bookings?status=${activeView}&range=${range}`}
                />
                <div className="grid items-start gap-4 lg:grid-cols-2">
                  <SchoolCombobox schools={schools} regions={regions} icon={<School2 className={iconClassName} />} />
                  <Field label="Presentation" icon={<Leaf className={iconClassName} />} required>
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

                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Teacher name" icon={<UserRound className={iconClassName} />} required>
                    <input name="contactName" autoComplete="name" required minLength={2} className={fieldClassName} />
                  </Field>
                  <Field label="Teacher email" icon={<Mail className={iconClassName} />} required>
                    <input type="email" name="contactEmail" autoComplete="email" required className={fieldClassName} />
                  </Field>
                  <Field label="Position (optional)" icon={<Briefcase className={iconClassName} />}>
                    <input name="contactPosition" maxLength={200} className={fieldClassName} />
                  </Field>
                  <Field label="Phone (optional)" icon={<Phone className={iconClassName} />}>
                    <input type="tel" name="contactPhone" autoComplete="tel" className={fieldClassName} />
                  </Field>
                </div>

                <div className="grid gap-4 lg:grid-cols-4">
                  <Field label="Date" icon={<CalendarDays className={iconClassName} />} required>
                    <input type="date" name="date" required className={fieldClassName} />
                  </Field>
                  <Field label="Start time" icon={<Clock3 className={iconClassName} />} required>
                    <input type="time" name="startTime" required className={fieldClassName} />
                  </Field>
                  <Field label="Duration (minutes)" icon={<Timer className={iconClassName} />} required>
                    <input
                      type="number"
                      name="durationMinutes"
                      min={1}
                      defaultValue={10}
                      required
                      className={fieldClassName}
                    />
                  </Field>
                  <Field label="Status" icon={<ListChecks className={iconClassName} />} required>
                    <select name="status" defaultValue="confirmed" className={fieldClassName}>
                      <option value="tentative">Tentative / pending</option>
                      <option value="applied">Applied</option>
                      <option value="ambassador_assigned">Ambassador assigned</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed_pending_report">Delivered, report needed</option>
                      <option value="report_submitted">Delivered, report submitted</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </Field>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <Field label="Year groups" icon={<GraduationCap className={iconClassName} />} required>
                    <input
                      name="yearLevels"
                      required
                      className={fieldClassName}
                      placeholder="Years 9 to 10"
                    />
                  </Field>
                  <Field label="Expected students" icon={<UsersRound className={iconClassName} />} required>
                    <input
                      type="number"
                      name="expectedStudentCount"
                      min={1}
                      required
                      className={fieldClassName}
                      placeholder="120"
                    />
                  </Field>
                  <Field label="Actual students" icon={<UserCheck className={iconClassName} />}>
                    <input
                      type="number"
                      name="actualStudentCount"
                      min={0}
                      className={fieldClassName}
                      placeholder="Optional"
                    />
                  </Field>
                </div>

                <div className="grid items-start gap-4 lg:grid-cols-2">
                  <Field label="Assigned ambassador" icon={<UserRoundCheck className={iconClassName} />}>
                    <select name="assignedAmbassadorId" defaultValue="" className={fieldClassName}>
                      <option value="">Unassigned</option>
                      {approvedAmbassadors.map((ambassador) => (
                        <option key={ambassador.id} value={ambassador.id}>
                          {ambassador.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Referred by ambassador" icon={<Handshake className={iconClassName} />}>
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

                <label className="flex items-start gap-3 rounded-[14px] border border-[color:var(--border-soft)] bg-white/70 px-4 py-3 text-sm text-[color:var(--navy)]">
                  <input
                    type="checkbox"
                    name="recordOnly"
                    checked={recordOnly}
                    onChange={(event) => setRecordOnly(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold">Record only, don&apos;t send any emails</span>
                    <span className="mt-0.5 block text-[color:var(--text-soft)]">
                      For backlogging bookings. Nothing is emailed to the school, the ambassador or finance, now or later.
                    </span>
                  </span>
                </label>


                <Field label="Internal notes" icon={<StickyNote className={iconClassName} />}>
                  <textarea
                    name="internalNotes"
                    className="min-h-24 w-full rounded-[16px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm"
                    placeholder="Source, context, delivery notes, or anything staff should know."
                  />
                </Field>

                <p className="text-xs italic leading-5 text-[color:var(--text-soft)]">
                  {recordOnly
                    ? "Past sessions are saved as delivered, reported and settled, so no report or payment is requested. Future sessions follow the normal flow without any emails; any invoice can be sent to finance by hand from Payments."
                    : "Tentative / pending bookings without an ambassador send a pending booking email. Confirmed bookings send a confirmation email, even if an ambassador is unassigned. Both emails include the booking reference and session details."}
                </p>

                <div className="flex flex-wrap justify-end gap-3 border-t border-[rgba(4,15,75,0.08)] pt-5">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" pendingLabel="Saving booking…" className="bg-[#2563eb] text-white hover:bg-[#1d4fd7]">
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

const iconClassName = "h-3.5 w-3.5 shrink-0 text-[color:var(--text-soft)]";

function Field({
  label,
  icon,
  required = false,
  children
}: {
  label: string;
  icon: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid content-start gap-2">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--navy)]">
        {icon}
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      {children}
    </label>
  );
}
