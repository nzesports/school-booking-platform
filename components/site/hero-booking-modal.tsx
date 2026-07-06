"use client";

import { useEffect, type ReactNode } from "react";
import {
  CalendarDays,
  Clock3,
  Layers3,
  MapPin,
  PencilLine,
  Send,
  UsersRound
} from "lucide-react";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isOtherRegionSlug } from "@/lib/domain/regions";
import type { PresentationType, Region } from "@/lib/domain/types";
import {
  addTenMinutes,
  formatDisplayDate,
  formatTimeLabel
} from "@/lib/services/time-slots";

export type HeroBookingDraftSession = {
  id: string;
  presentationSlug: string;
  date: string;
  startTime: string;
  timeText: string;
  regionSlug: string;
  customRegion?: string;
  yearLevels: string;
  expectedStudentCount: number;
};

export function HeroBookingModal({
  open,
  onClose,
  regions,
  presentations,
  sessions,
  action
}: {
  open: boolean;
  onClose: () => void;
  regions: Region[];
  presentations: PresentationType[];
  sessions: HeroBookingDraftSession[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const sessionHeading = sessions.length === 1 ? "Selected session" : "Selected sessions";
  const editLabel = sessions.length === 1 ? "Edit session" : "Edit sessions";
  const draftSummary =
    sessions.length === 1 ? "1 session draft ready" : `${sessions.length} session draft ready`;

  return (
    <BookingDialogShell
      kicker="Complete your booking"
      title="Review and send your booking request"
      description="We'll check availability and confirm the session details with your school before anything is final."
      onClose={onClose}
    >
      <form action={action} className="mt-7">
            <input type="hidden" name="sessionsCount" value={sessions.length} />
            <input type="hidden" name="regionSlug" value={sessions[0]?.regionSlug ?? ""} />

            <section className="rounded-[28px] border border-[rgba(164,202,227,0.55)] bg-[linear-gradient(180deg,rgba(243,249,255,0.95),rgba(255,255,255,0.96))] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)] md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_14px_30px_rgba(11,24,77,0.08)]">
                    <CalendarDays className="h-5 w-5 text-[color:var(--navy)]" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                      {sessionHeading}
                    </p>
                    <p className="mt-1 text-sm leading-7 text-[color:var(--text-soft)]">
                      Review the session details below before you send the request.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                  className="min-h-[46px] rounded-[16px] px-5 py-2.5 text-sm"
                >
                  <PencilLine className="h-4 w-4" />
                  {editLabel}
                </Button>
              </div>

              <div className="mt-5 grid gap-4">
                {sessions.map((session, index) => {
                  const presentation = presentations.find(
                    (item) => item.slug === session.presentationSlug
                  );
                  const customRegion = session.customRegion?.trim() ?? "";
                  const regionName =
                    isOtherRegionSlug(session.regionSlug) && customRegion
                      ? customRegion
                      : regions.find((region) => region.slug === session.regionSlug)?.name ??
                        "Selected region";

                  return (
                    <div
                      key={session.id}
                      className="rounded-[24px] border border-[rgba(4,15,75,0.08)] bg-white/88 p-5 shadow-[0_14px_32px_rgba(11,24,77,0.06)]"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                            Session {index + 1}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <p className="text-[1.9rem] font-semibold leading-tight tracking-[-0.05em] text-[color:var(--navy)]">
                              {presentation?.title ?? "Presentation"}
                            </p>
                            <span className="rounded-full bg-[color:var(--blue-soft)] px-3 py-1.5 text-sm font-semibold text-[color:var(--navy)]">
                              {session.yearLevels}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-x-4 md:grid-cols-4 md:gap-x-0 md:divide-x md:divide-[rgba(4,15,75,0.1)]">
                        <SessionSummaryItem
                          icon={<CalendarDays className="h-5 w-5" />}
                          label="Date"
                          value={formatDisplayDate(session.date)}
                        />
                        <SessionSummaryItem
                          icon={<Clock3 className="h-5 w-5" />}
                          label="Time"
                          value={`${formatTimeLabel(session.startTime)} - ${formatTimeLabel(addTenMinutes(session.startTime))}`}
                        />
                        <SessionSummaryItem
                          icon={<MapPin className="h-5 w-5" />}
                          label="Region"
                          value={regionName}
                        />
                        <div className="px-0 py-4 md:px-6">
                          <div className="flex items-start gap-3 text-[color:var(--navy)]">
                            <UsersRound className="mt-0.5 h-5 w-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-[color:var(--text-soft)]">
                                Expected students
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <Input
                                  name={`session-${index}-expectedStudentCount`}
                                  type="number"
                                  min={1}
                                  defaultValue={
                                    session.expectedStudentCount > 0
                                      ? session.expectedStudentCount
                                      : ""
                                  }
                                  placeholder="e.g. 120"
                                  required
                                  className="h-11 max-w-[128px] rounded-[14px] px-3 py-2"
                                />
                                <span className="text-sm font-medium text-[color:var(--navy)]">
                                  students
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <input
                        type="hidden"
                        name={`session-${index}-presentationSlug`}
                        value={session.presentationSlug}
                      />
                      <input
                        type="hidden"
                        name={`session-${index}-regionSlug`}
                        value={session.regionSlug}
                      />
                      <input
                        type="hidden"
                        name={`session-${index}-customRegion`}
                        value={customRegion}
                      />
                      <input type="hidden" name={`session-${index}-date`} value={session.date} />
                      <input
                        type="hidden"
                        name={`session-${index}-startTime`}
                        value={session.startTime}
                      />
                      <input
                        type="hidden"
                        name={`session-${index}-endTime`}
                        value={addTenMinutes(session.startTime)}
                      />
                      <input
                        type="hidden"
                        name={`session-${index}-yearLevels`}
                        value={session.yearLevels}
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-8">
              <h3 className="text-[2rem] font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                School contact details
              </h3>
              <p className="mt-2 text-base leading-8 text-[color:var(--text-soft)]">
                Tell us who we should contact to confirm this request.
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="School name">
                  <Input name="schoolName" placeholder="Rangitoto College" required />
                </Field>
                <Field label="Primary contact name">
                  <Input name="contactName" placeholder="Jordan Smith" required />
                </Field>
                <Field label="Primary contact email">
                  <Input
                    name="contactEmail"
                    type="email"
                    placeholder="jordan@school.nz"
                    required
                  />
                </Field>
                <Field label="Primary contact phone">
                  <Input name="contactPhone" placeholder="+64 21 555 123" required />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="School notes (optional)">
                  <Textarea
                    name="schoolNotes"
                    placeholder="Assembly timing, room setup, accessibility notes, or anything else the team should know."
                    className="min-h-[96px]"
                  />
                </Field>
              </div>
            </section>

            <label className="mt-5 flex items-start gap-3 text-sm text-[color:var(--navy)]">
              <input
                type="checkbox"
                name="marketingConsent"
                defaultChecked
                className="mt-1 h-4 w-4 rounded border-[color:var(--border-soft)]"
              />
              <span>Send me occasional NZ Esports school updates and resources.</span>
            </label>

            <div className="mt-6 rounded-[24px] border border-[rgba(164,202,227,0.55)] bg-[linear-gradient(180deg,rgba(243,249,255,0.95),rgba(255,255,255,0.96))] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-4 text-[color:var(--navy)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_14px_30px_rgba(11,24,77,0.08)]">
                    <Layers3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[1.4rem] font-semibold tracking-[-0.04em]">{draftSummary}</p>
                    <p className="mt-1 text-sm leading-7 text-[color:var(--text-soft)]">
                      This is a request only. Our team will confirm availability before your
                      booking is final.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    className="min-h-[48px] rounded-[18px] px-6 py-2.5"
                  >
                    Back to booking
                  </Button>
                  <Button type="submit" className="min-h-[48px] rounded-[18px] px-6 py-2.5">
                    <Send className="h-4 w-4" />
                    Send request
                  </Button>
                </div>
              </div>
            </div>
      </form>
    </BookingDialogShell>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[color:var(--navy)]">{label}</span>
      {children}
    </label>
  );
}

function SessionSummaryItem({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="px-0 py-4 md:px-6">
      <div className="flex items-start gap-3 text-[color:var(--navy)]">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[color:var(--text-soft)]">{label}</p>
          <p className="mt-1 text-[1.1rem] font-medium tracking-[-0.02em] text-[color:var(--navy)]">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

