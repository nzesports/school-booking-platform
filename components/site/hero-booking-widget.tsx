"use client";

import { CalendarDays, Clock3, MapPin, MonitorPlay, Plus, Trash2, UsersRound } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  HeroBookingModal,
  type HeroBookingDraftSession
} from "@/components/site/hero-booking-modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { buildAvailabilitySlots, nextBookableDates } from "@/lib/services/availability";
import type { PresentationType, Region } from "@/lib/domain/types";

export function HeroBookingWidget({
  presentations,
  regions,
  action
}: {
  presentations: PresentationType[];
  regions: Region[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const dates = nextBookableDates(21);
  const initialPresentation = presentations[0];
  const initialDate = dates[0] ?? "";
  const initialSlots = buildAvailabilitySlots(initialDate);
  const [sessions, setSessions] = useState<HeroBookingDraftSession[]>([
    createDraftSession({
      id: "session-1",
      presentation: initialPresentation,
      date: initialDate,
      startTime: initialSlots[0]?.startTime ?? "09:00",
      regionSlug: regions[0]?.slug ?? ""
    })
  ]);
  const [nextSessionNumber, setNextSessionNumber] = useState(2);
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div
        id="regions"
        className="mt-12 rounded-[30px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.76))] p-4 shadow-[0_24px_54px_rgba(11,24,77,0.1)] backdrop-blur-2xl md:p-5 lg:p-6"
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
            Plan your visit
          </p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-2xl">
            Build one or more school presentation sessions.
          </p>
        </div>

        <div className="mt-6 grid gap-3">
          {sessions.map((session, index) => {
            const timeOptions = buildAvailabilitySlots(session.date);
            const activeTime = timeOptions.find((slot) => slot.startTime === session.startTime);
            const fallbackTime = timeOptions[0]?.startTime ?? session.startTime;

            return (
              <div
                key={session.id}
                className="rounded-[24px] border border-white/75 bg-white/70 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] backdrop-blur-xl md:p-5"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-[0_10px_22px_rgba(11,24,77,0.06)]">
                      <UsersRound className="h-4 w-4 text-[color:var(--navy)]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                        Session {index + 1}
                      </p>
                      <p className="text-sm text-[color:var(--text-soft)]">
                        Add the topic, date, time, and region for this session.
                      </p>
                    </div>
                  </div>

                  {sessions.length > 1 ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-[rgba(157,36,36,0.12)] bg-[#fff6f6] px-4 py-2 text-sm font-semibold text-[#9d2424]"
                      onClick={() =>
                        setSessions((current) =>
                          current.filter((item) => item.id !== session.id)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3 xl:grid-cols-[1.2fr_0.95fr_0.95fr_1fr]">
                  <Field icon={<MonitorPlay className="h-4 w-4" />} label="Presentation">
                    <Select
                      value={session.presentationSlug}
                      onChange={(event) =>
                        setSessions((current) =>
                          current.map((item) => {
                            if (item.id !== session.id) {
                              return item;
                            }

                            const presentation = presentations.find(
                              (entry) => entry.slug === event.target.value
                            );

                            return {
                              ...item,
                              presentationSlug: event.target.value,
                              yearLevels: presentation?.yearLevels ?? item.yearLevels
                            };
                          })
                        )
                      }
                    >
                      {presentations.map((presentation) => (
                        <option key={presentation.id} value={presentation.slug}>
                          {presentation.title}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field icon={<CalendarDays className="h-4 w-4" />} label="Date">
                    <Select
                      value={session.date}
                      onChange={(event) =>
                        setSessions((current) =>
                          current.map((item) => {
                            if (item.id !== session.id) {
                              return item;
                            }

                            const nextTimeOptions = buildAvailabilitySlots(event.target.value);

                            return {
                              ...item,
                              date: event.target.value,
                              startTime:
                                nextTimeOptions.find(
                                  (slot) => slot.startTime === item.startTime
                                )?.startTime ??
                                nextTimeOptions[0]?.startTime ??
                                item.startTime
                            };
                          })
                        )
                      }
                    >
                      {dates.map((date) => (
                        <option key={date} value={date}>
                          {formatDisplayDate(date)}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field icon={<Clock3 className="h-4 w-4" />} label="Time">
                    <Select
                      value={activeTime?.startTime ?? fallbackTime}
                      onChange={(event) =>
                        setSessions((current) =>
                          current.map((item) =>
                            item.id === session.id
                              ? { ...item, startTime: event.target.value }
                              : item
                          )
                        )
                      }
                    >
                      {timeOptions.map((slot) => (
                        <option key={slot.startTime} value={slot.startTime}>
                          {slot.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field icon={<MapPin className="h-4 w-4" />} label="Region">
                    <Select
                      value={session.regionSlug}
                      onChange={(event) =>
                        setSessions((current) =>
                          current.map((item) =>
                            item.id === session.id
                              ? { ...item, regionSlug: event.target.value }
                              : item
                          )
                        )
                      }
                    >
                      {regions.map((region) => (
                        <option key={region.id} value={region.slug}>
                          {region.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/70 px-4 py-2.5 text-sm text-[color:var(--text-muted)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]">
            <span>Proudly supported by</span>
            <span className="rounded-full bg-[linear-gradient(135deg,#198d3d,#0c5f2b)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">
              Berocca
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSessions((current) => {
                  const previous = current[current.length - 1];
                  const presentation =
                    presentations.find((item) => item.slug === previous?.presentationSlug) ??
                    initialPresentation;

                  return [
                    ...current,
                    createDraftSession({
                      id: `session-${nextSessionNumber}`,
                      presentation,
                      date: previous?.date ?? initialDate,
                      startTime: previous?.startTime ?? initialSlots[0]?.startTime ?? "09:00",
                      regionSlug: previous?.regionSlug ?? regions[0]?.slug ?? ""
                    })
                  ];
                });
                setNextSessionNumber((current) => current + 1);
              }}
              className="rounded-full px-5 py-2.5 text-sm"
            >
              <Plus className="h-4 w-4" />
              Add another session
            </Button>

            <Button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="min-h-[50px] rounded-[18px] px-5 py-2.5"
            >
              Book now
            </Button>
          </div>
        </div>
      </div>

      <HeroBookingModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        regions={regions}
        presentations={presentations}
        sessions={sessions}
        action={action}
      />
    </>
  );
}

function Field({
  label,
  icon,
  children
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-white/75 bg-white/66 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.52)] backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold tracking-[0.02em] text-[color:var(--navy)]">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function createDraftSession({
  id,
  presentation,
  date,
  startTime,
  regionSlug
}: {
  id: string;
  presentation?: PresentationType;
  date: string;
  startTime: string;
  regionSlug: string;
}): HeroBookingDraftSession {
  return {
    id,
    presentationSlug: presentation?.slug ?? "",
    date,
    startTime,
    regionSlug,
    yearLevels: presentation?.yearLevels ?? "Years 7 to 8",
    expectedStudentCount: 120
  };
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
