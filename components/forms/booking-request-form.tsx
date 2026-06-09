"use client";

import {
  CalendarDays,
  Clock3,
  MapPin,
  MonitorPlay,
  Plus,
  Trash2,
  Users
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { nextBookableDates } from "@/lib/services/availability";
import type { PresentationType, Region } from "@/lib/domain/types";

type SessionState = {
  presentationSlug: string;
  date: string;
  startTime: string;
  endTime: string;
  yearLevels: string;
  expectedStudentCount: number;
};

const steps = ["Presentations", "Sessions", "Your details", "Review & confirm"];

export function BookingRequestForm({
  presentations,
  regions,
  initialPresentationSlug,
  initialRegionSlug,
  initialDate,
  initialTime,
  action
}: {
  presentations: PresentationType[];
  regions: Region[];
  initialPresentationSlug?: string;
  initialRegionSlug?: string;
  initialDate?: string;
  initialTime?: string;
  action: (formData: FormData) => void;
}) {
  const dates = nextBookableDates(30);
  const [sessions, setSessions] = useState<SessionState[]>([
    {
      presentationSlug: initialPresentationSlug ?? presentations[0]?.slug ?? "",
      date: initialDate ?? dates[0] ?? "",
      startTime: initialTime ?? "09:00",
      endTime: addTenMinutes(initialTime ?? "09:00"),
      yearLevels: "Years 7 to 13",
      expectedStudentCount: 120
    }
  ]);

  const firstRegion = initialRegionSlug ?? regions[0]?.slug ?? "";
  const [regionSlug, setRegionSlug] = useState(firstRegion);

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="sessionsCount" value={sessions.length} />

      <Card className="rounded-[34px] p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-4">
          {steps.map((step, index) => (
            <div
              key={step}
              className="rounded-[22px] bg-[linear-gradient(135deg,#ffffff,#f5fbff)] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    index === 1
                      ? "bg-[color:var(--green)] text-white"
                      : "bg-[color:var(--blue-soft)] text-[color:var(--navy)]"
                  }`}
                >
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                    Step {index + 1}
                  </p>
                  <p className="font-semibold text-[color:var(--navy)]">{step}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="rounded-[34px] bg-[linear-gradient(135deg,#f7fbff,#f9fcff)] xl:sticky xl:top-28 xl:h-fit">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
            Your details
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
            Tell us about your school.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--text-soft)]">
            Every request starts as tentative. Staff will review availability and ambassador
            coverage before confirming.
          </p>

          <div className="mt-6 grid gap-4">
            <Field label="School name">
              <Input name="schoolName" placeholder="Harbour Secondary College" required />
            </Field>
            <Field label="Region">
              <Select
                name="regionSlug"
                value={regionSlug}
                onChange={(event) => setRegionSlug(event.target.value)}
                required
              >
                {regions.map((region) => (
                  <option key={region.id} value={region.slug}>
                    {region.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Primary contact name">
              <Input name="contactName" placeholder="Jules Morgan" required />
            </Field>
            <Field label="Primary contact email">
              <Input name="contactEmail" type="email" placeholder="jules@school.nz" required />
            </Field>
            <Field label="Primary contact phone">
              <Input name="contactPhone" placeholder="+64 21 555 123" required />
            </Field>
            <Field label="School notes">
              <Textarea
                name="schoolNotes"
                placeholder="Assembly timing, room setup, accessibility, or anything our team should know."
              />
            </Field>
          </div>

          <div className="mt-6 rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
              Selected sessions
            </p>
            <div className="mt-4 grid gap-3">
              {sessions.map((session, index) => {
                const presentation = presentations.find(
                  (item) => item.slug === session.presentationSlug
                );

                return (
                  <div
                    key={`${session.presentationSlug}-${index}`}
                    className="rounded-[20px] bg-[linear-gradient(135deg,#f7fbff,#f7fdf8)] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]"
                  >
                    <p className="font-semibold text-[color:var(--navy)]">
                      {presentation?.title ?? "Presentation"}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                      {session.date} · {session.startTime} - {session.endTime}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <label className="mt-6 flex items-start gap-3 rounded-[22px] border border-[color:var(--border-soft)] bg-white/88 px-4 py-4 text-sm text-[color:var(--text-soft)]">
            <input type="checkbox" name="marketingConsent" defaultChecked className="mt-1" />
            Keep me updated about future NZ Esports school opportunities and resources.
          </label>
        </Card>

        <div className="grid gap-5">
          {sessions.map((session, index) => (
            <Card key={`session-${index}`} className="rounded-[34px]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                    Session {index + 1}
                  </p>
                  <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                    Select your session details
                  </h3>
                  <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                    Choose a presentation, preferred date, timing, and audience size.
                  </p>
                </div>
                {sessions.length > 1 ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-[#fff1f1] px-4 py-2 text-sm font-semibold text-[#9d2424]"
                    onClick={() =>
                      setSessions((current) =>
                        current.filter((_, currentIndex) => currentIndex !== index)
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Presentation">
                  <IconLabel icon={<MonitorPlay className="h-4 w-4" />} />
                  <Select
                    name={`session-${index}-presentationSlug`}
                    value={session.presentationSlug}
                    onChange={(event) =>
                      setSessions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, presentationSlug: event.target.value }
                            : item
                        )
                      )
                    }
                    required
                  >
                    {presentations.map((presentation) => (
                      <option key={presentation.id} value={presentation.slug}>
                        {presentation.title}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Date">
                  <IconLabel icon={<CalendarDays className="h-4 w-4" />} />
                  <Select
                    name={`session-${index}-date`}
                    value={session.date}
                    onChange={(event) =>
                      setSessions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, date: event.target.value } : item
                        )
                      )
                    }
                    required
                  >
                    {dates.map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Start time">
                  <IconLabel icon={<Clock3 className="h-4 w-4" />} />
                  <Input
                    name={`session-${index}-startTime`}
                    value={session.startTime}
                    onChange={(event) =>
                      setSessions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                startTime: event.target.value,
                                endTime: addTenMinutes(event.target.value)
                              }
                            : item
                        )
                      )
                    }
                    required
                  />
                </Field>

                <Field label="End time">
                  <IconLabel icon={<MapPin className="h-4 w-4" />} />
                  <Input name={`session-${index}-endTime`} value={session.endTime} readOnly />
                </Field>

                <Field label="Year levels">
                  <IconLabel icon={<Users className="h-4 w-4" />} />
                  <Input
                    name={`session-${index}-yearLevels`}
                    value={session.yearLevels}
                    onChange={(event) =>
                      setSessions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, yearLevels: event.target.value } : item
                        )
                      )
                    }
                    required
                  />
                </Field>

                <Field label="Expected student count">
                  <IconLabel icon={<Users className="h-4 w-4" />} />
                  <Input
                    name={`session-${index}-expectedStudentCount`}
                    type="number"
                    min={1}
                    value={session.expectedStudentCount}
                    onChange={(event) =>
                      setSessions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                expectedStudentCount: Number(event.target.value || 0)
                              }
                            : item
                        )
                      )
                    }
                    required
                  />
                </Field>
              </div>
            </Card>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() =>
                setSessions((current) => [
                  ...current,
                  {
                    presentationSlug: current.at(-1)?.presentationSlug ?? presentations[0]?.slug ?? "",
                    date: current.at(-1)?.date ?? dates[0] ?? "",
                    startTime: current.at(-1)?.startTime ?? "09:00",
                    endTime:
                      current.at(-1)?.endTime ??
                      addTenMinutes(current.at(-1)?.startTime ?? "09:00"),
                    yearLevels: current.at(-1)?.yearLevels ?? "Years 7 to 13",
                    expectedStudentCount: current.at(-1)?.expectedStudentCount ?? 120
                  }
                ])
              }
              className="inline-flex items-center gap-2 rounded-full bg-[color:var(--blue-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--navy)]"
            >
              <Plus className="h-4 w-4" />
              Add another session
            </button>

            <Button type="submit">Submit tentative booking request</Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function IconLabel({ icon }: { icon: ReactNode }) {
  return (
    <span className="mb-1 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
      {icon}
    </span>
  );
}

function addTenMinutes(startTime: string) {
  const [hourString, minuteString] = startTime.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);
  const date = new Date();
  date.setHours(hour, minute + 10, 0, 0);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
