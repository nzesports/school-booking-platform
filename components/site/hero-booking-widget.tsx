"use client";

import { CalendarDays, Clock3, MapPin, MonitorPlay, Plus, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useBookingModal } from "@/components/site/booking-modal-provider";
import type { HeroBookingDraftSession } from "@/components/site/hero-booking-modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { PresentationType, Region } from "@/lib/domain/types";
import { buildAvailabilitySlots, nextBookableDates } from "@/lib/services/availability";

export function HeroBookingWidget({
  presentations,
  regions,
  initialPresentationSlug,
  initialRegionSlug,
  initialDate,
  initialTime,
  mode = "homepage"
}: {
  presentations: PresentationType[];
  regions: Region[];
  initialPresentationSlug?: string;
  initialRegionSlug?: string;
  initialDate?: string;
  initialTime?: string;
  mode?: "homepage" | "page";
}) {
  const bookingModal = useBookingModal();
  const dates = nextBookableDates(21);
  const firstDate = dates.includes(initialDate ?? "") ? (initialDate as string) : dates[0] ?? "";
  const initialPresentation =
    presentations.find((item) => item.slug === initialPresentationSlug) ?? presentations[0];
  const initialSlots = buildAvailabilitySlots(firstDate);
  const preferredInitialTime = initialTime
    ? normalizeTimeToSlot(initialTime, initialSlots)
    : { startTime: "", label: "" };
  const firstRegionSlug =
    regions.find((item) => item.slug === initialRegionSlug)?.slug ?? "";
  const [sessions, setSessions] = useState<HeroBookingDraftSession[]>([
    createDraftSession({
      id: "session-1",
      presentation: initialPresentation,
      date: firstDate,
      startTime: preferredInitialTime.startTime,
      timeText: preferredInitialTime.label,
      regionSlug: firstRegionSlug
    })
  ]);
  const [nextSessionNumber, setNextSessionNumber] = useState(2);

  const shellClassName =
    mode === "page"
      ? "rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.88))] p-5 shadow-[0_28px_62px_rgba(11,24,77,0.12)] backdrop-blur-2xl md:p-6 lg:p-7"
      : "mt-12 rounded-[30px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.76))] p-4 shadow-[0_24px_54px_rgba(11,24,77,0.1)] backdrop-blur-2xl md:p-5 lg:p-6";

  const helperText = useMemo(
    () =>
      mode === "page"
        ? "Choose your sessions here, then confirm everything in the request form."
        : "Build one or more school presentation sessions.",
    [mode]
  );
  const canOpenReview = sessions.every(
    (session) =>
      Boolean(session.presentationSlug) &&
      Boolean(session.date) &&
      Boolean(session.startTime) &&
      Boolean(session.regionSlug)
  );
  const canLaunchRequest = canOpenReview && Boolean(bookingModal);

  return (
    <div id="regions" className={shellClassName}>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          Plan your visit
        </p>
        <p className="text-xl font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-2xl">
          {helperText}
        </p>
        {mode === "page" ? (
          <p className="max-w-3xl text-sm leading-7 text-[color:var(--text-soft)]">
            Pick the topic, date, time, and region for each session. Choose from the available
            10-minute slots between 8:00am and 4:00pm, then continue once each session is
            ready to send.
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3">
        {sessions.map((session, index) => {
          const timeOptions = buildAvailabilitySlots(session.date);

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
                      setSessions((current) => current.filter((item) => item.id !== session.id))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 xl:grid-cols-[1.15fr_0.95fr_1fr_1fr]">
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
                          const normalized = normalizeTimeToSlot(item.startTime, nextTimeOptions);

                          return {
                            ...item,
                            date: event.target.value,
                            startTime: normalized.startTime,
                            timeText: normalized.label
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
                  <div>
                    <Select
                      value={session.startTime}
                      onChange={(event) =>
                        setSessions((current) =>
                          current.map((item) => {
                            if (item.id !== session.id) {
                              return item;
                            }

                            const selectedSlot =
                              timeOptions.find((slot) => slot.startTime === event.target.value) ??
                              null;

                            return {
                              ...item,
                              startTime: selectedSlot?.startTime ?? "",
                              timeText: selectedSlot?.label ?? ""
                            };
                          })
                        )
                      }
                    >
                      <option value="">Select a time</option>
                      {timeOptions.map((slot) => (
                        <option key={slot.startTime} value={slot.startTime}>
                          {slot.label}
                        </option>
                      ))}
                    </Select>
                    <p className="mt-2 text-xs text-[color:var(--text-soft)]">
                      Available between 8:00am and 4:00pm in 10-minute slots.
                    </p>
                  </div>
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
                    <option value="">Select your region</option>
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
                    date: previous?.date ?? firstDate,
                    startTime: "",
                    timeText: "",
                    regionSlug: previous?.regionSlug ?? ""
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
            onClick={() => {
              if (!canLaunchRequest || !bookingModal) {
                return;
              }

              bookingModal.openBooking({
                initialStep: "review",
                sessions: normalizeSessions(sessions)
              });
            }}
            className="min-h-[50px] rounded-[18px] px-5 py-2.5"
            disabled={!canLaunchRequest}
          >
            Book now
          </Button>
        </div>
      </div>

      {!canOpenReview ? (
        <p className="mt-3 text-sm text-[color:var(--text-soft)]">
          Choose a time and region for each session before continuing.
        </p>
      ) : null}
    </div>
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
  timeText,
  regionSlug
}: {
  id: string;
  presentation?: PresentationType;
  date: string;
  startTime: string;
  timeText: string;
  regionSlug: string;
}): HeroBookingDraftSession {
  return {
    id,
    presentationSlug: presentation?.slug ?? "",
    date,
    startTime,
    timeText,
    regionSlug,
    yearLevels: presentation?.yearLevels ?? "Years 7 to 8",
    expectedStudentCount: 120
  };
}

function normalizeSessions(current: HeroBookingDraftSession[]) {
  return current.map((session) => {
    if (!session.timeText && !session.startTime) {
      return session;
    }

    const timeOptions = buildAvailabilitySlots(session.date);
    const normalized = normalizeTimeToSlot(session.timeText || session.startTime, timeOptions);

    return {
      ...session,
      startTime: normalized.startTime,
      timeText: normalized.label
    };
  });
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

function normalizeTimeToSlot(
  value: string,
  timeOptions: Array<{ startTime: string; label: string }>
) {
  if (!value.trim()) {
    return { startTime: "", label: "" };
  }

  const fallback = timeOptions[0] ?? { startTime: "08:00", label: "8:00 AM - 8:10 AM" };
  const directMatch =
    timeOptions.find(
      (slot) =>
        slot.label.toLowerCase() === value.trim().toLowerCase() ||
        slot.startTime === value.trim()
    ) ?? null;

  if (directMatch) {
    return { startTime: directMatch.startTime, label: formatTimeLabel(directMatch.startTime) };
  }

  const parsedMinutes = parseTypedTime(value);

  if (parsedMinutes === null) {
    return { startTime: fallback.startTime, label: formatTimeLabel(fallback.startTime) };
  }

  const nearest = timeOptions.reduce((closest, slot) => {
    const slotMinutes = toMinutes(slot.startTime);
    const slotDistance = Math.abs(slotMinutes - parsedMinutes);
    const closestDistance = Math.abs(toMinutes(closest.startTime) - parsedMinutes);

    return slotDistance < closestDistance ? slot : closest;
  }, fallback);

  return { startTime: nearest.startTime, label: formatTimeLabel(nearest.startTime) };
}

function parseTypedTime(value: string) {
  const normalised = value.trim().toLowerCase().replace(/\s+/g, "");

  if (!normalised) {
    return null;
  }

  const meridiemMatch = normalised.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)$/);

  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2] ?? "0");
    const meridiem = meridiemMatch[3];

    if (meridiem === "pm" && hours !== 12) {
      hours += 12;
    }

    if (meridiem === "am" && hours === 12) {
      hours = 0;
    }

    return hours * 60 + minutes;
  }

  const plainMatch = normalised.match(/^(\d{1,2})(?::?(\d{2}))?$/);

  if (!plainMatch) {
    return null;
  }

  const hours = Number(plainMatch[1]);
  const minutes = Number(plainMatch[2] ?? "0");

  return hours * 60 + minutes;
}

function toMinutes(value: string) {
  const [hoursString, minutesString] = value.split(":");
  return Number(hoursString) * 60 + Number(minutesString);
}

function formatTimeLabel(value: string) {
  const [hoursString, minutesString] = value.split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}
