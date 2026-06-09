"use client";

import { useEffect, type ReactNode } from "react";
import { CalendarDays, Clock3, Layers3, MapPin, School2, UsersRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PresentationType, Region } from "@/lib/domain/types";

export type HeroBookingDraftSession = {
  id: string;
  presentationSlug: string;
  date: string;
  startTime: string;
  regionSlug: string;
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

  const uniqueRegionNames = Array.from(
    new Set(
      sessions
        .map((session) => regions.find((region) => region.slug === session.regionSlug)?.name)
        .filter(Boolean)
    )
  ) as string[];

  const summaryTitle =
    uniqueRegionNames.length <= 1
      ? uniqueRegionNames[0] ?? "Selected region"
      : `${uniqueRegionNames.length} regions selected`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(4,15,75,0.4)] px-4 py-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hero-booking-modal-title"
        className="w-full max-w-[1080px] overflow-hidden rounded-[30px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(247,250,252,0.98))] shadow-[0_36px_80px_rgba(11,24,77,0.22)]"
      >
        <div className="flex items-center justify-between border-b border-[rgba(4,15,75,0.08)] px-5 py-4 md:px-7">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Complete your booking
            </p>
            <h2
              id="hero-booking-modal-title"
              className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.05em] text-[color:var(--navy-strong)] md:text-[2.2rem]"
            >
              Send your school presentation request.
            </h2>
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-11 min-h-[44px] w-11 rounded-[14px] border border-[rgba(4,15,75,0.08)] bg-white/72 px-0 py-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form action={action} className="max-h-[calc(100vh-2rem)] overflow-y-auto lg:max-h-none">
          <input type="hidden" name="sessionsCount" value={sessions.length} />
          <input type="hidden" name="regionSlug" value={sessions[0]?.regionSlug ?? ""} />

          <div className="grid gap-6 px-5 py-5 md:px-7 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[26px] border border-[rgba(4,15,75,0.08)] bg-[linear-gradient(180deg,rgba(238,247,252,0.9),rgba(255,255,255,0.88))] p-5">
              <div className="flex items-center gap-3 text-[color:var(--navy)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-[0_10px_22px_rgba(11,24,77,0.08)]">
                  <School2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                    Draft summary
                  </p>
                  <p className="font-semibold">{summaryTitle}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {sessions.map((session, index) => {
                  const presentation = presentations.find(
                    (item) => item.slug === session.presentationSlug
                  );
                  const regionName =
                    regions.find((region) => region.slug === session.regionSlug)?.name ??
                    "Selected region";

                  return (
                    <div
                      key={session.id}
                      className="rounded-[22px] border border-white/75 bg-white/84 p-4 shadow-[0_12px_28px_rgba(11,24,77,0.06)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                            Session {index + 1}
                          </p>
                          <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                            {presentation?.title ?? "Presentation"}
                          </p>
                        </div>
                        <span className="rounded-full bg-[color:var(--blue-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--navy)]">
                          {session.yearLevels}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-sm text-[color:var(--text-soft)]">
                        <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(4,15,75,0.08)] bg-white px-3 py-1.5">
                          <CalendarDays className="h-4 w-4" />
                          {formatDisplayDate(session.date)}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(4,15,75,0.08)] bg-white px-3 py-1.5">
                          <Clock3 className="h-4 w-4" />
                          {session.startTime} - {addTenMinutes(session.startTime)}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(4,15,75,0.08)] bg-white px-3 py-1.5">
                          <MapPin className="h-4 w-4" />
                          {regionName}
                        </span>
                      </div>

                      <div className="mt-4">
                        <label className="grid gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                            Expected student count
                          </span>
                          <Input
                            name={`session-${index}-expectedStudentCount`}
                            type="number"
                            min={1}
                            defaultValue={session.expectedStudentCount}
                            required
                          />
                        </label>
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

              <p className="mt-4 text-sm leading-7 text-[color:var(--text-soft)]">
                Need to change a topic, date, time, or region? Close this form and adjust the
                draft in the booking widget first.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                School contact details
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[color:var(--text-soft)]">
                This sends a tentative request to the NZ Esports team. They’ll confirm
                availability and next steps with your school.
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
                <Field label="School notes">
                  <Textarea
                    name="schoolNotes"
                    placeholder="Assembly timing, room setup, accessibility notes, or anything else the team should know."
                    className="min-h-[110px]"
                  />
                </Field>
              </div>

              <label className="mt-4 flex items-start gap-3 rounded-[20px] border border-[rgba(4,15,75,0.08)] bg-white/78 px-4 py-3.5 text-sm text-[color:var(--text-soft)]">
                <input type="checkbox" name="marketingConsent" defaultChecked className="mt-1" />
                Keep me updated about future NZ Esports school opportunities and resources.
              </label>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[rgba(4,15,75,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(238,247,252,0.82))] px-4 py-4">
                <div className="flex items-center gap-3 text-[color:var(--navy)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_10px_22px_rgba(11,24,77,0.08)]">
                    <Layers3 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{sessions.length} session draft ready</p>
                    <p className="text-xs text-[color:var(--text-soft)]">
                      Reviewed by staff before anything is confirmed.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={onClose}>
                    Keep editing
                  </Button>
                  <Button type="submit">
                    <UsersRound className="h-4 w-4" />
                    Send booking request
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
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
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function addTenMinutes(value: string) {
  const [hoursString, minutesString] = value.split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);

  const date = new Date();
  date.setHours(hours, minutes + 10, 0, 0);

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDisplayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(date);
}
