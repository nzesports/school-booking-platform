"use client";

import Image from "next/image";
import { CalendarDays, Clock3, MapPin, MonitorPlay, Plus, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import beroccaLogo from "@/public/media/berocca-logo.png";

import { BookingDatePicker, BookingTimeCombobox } from "@/components/site/booking-field-pickers";
import { useBookingModal } from "@/components/site/booking-modal-provider";
import type { HeroBookingDraftSession } from "@/components/site/hero-booking-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isOtherRegionSlug, regionDisplayName } from "@/lib/domain/regions";
import type { PresentationType, Region } from "@/lib/domain/types";
import {
  BOOKING_WINDOW_DAYS,
  type AvailabilityConfig,
  isBookableDate,
  nextBookableDates
} from "@/lib/services/availability";
import { resolveTypedTimeInWindow } from "@/lib/services/time-slots";
import { cn } from "@/lib/utils";

export function HeroBookingWidget({
  presentations,
  regions,
  initialPresentationSlug,
  initialRegionSlug,
  initialDate,
  initialTime,
  availabilityConfig,
  mode = "homepage"
}: {
  presentations: PresentationType[];
  regions: Region[];
  initialPresentationSlug?: string;
  initialRegionSlug?: string;
  initialDate?: string;
  initialTime?: string;
  availabilityConfig?: AvailabilityConfig;
  mode?: "homepage" | "page" | "compact";
}) {
  const bookingModal = useBookingModal();
  const dates = nextBookableDates(BOOKING_WINDOW_DAYS, availabilityConfig);
  const firstDate = dates.includes(initialDate ?? "") ? (initialDate as string) : dates[0] ?? "";
  const maxBookableDate = dates[dates.length - 1] ?? firstDate;
  const initialPresentation =
    presentations.find((item) => item.slug === initialPresentationSlug) ?? presentations[0];
  const preferredInitialTime = (initialTime ? resolveTypedTimeInWindow(initialTime) : null) ?? {
    startTime: "",
    label: ""
  };
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
      : mode === "compact"
        ? "rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.88))] p-4 shadow-[0_24px_54px_rgba(11,24,77,0.1)] backdrop-blur-2xl md:p-5"
        : "mt-8 rounded-[30px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.76))] p-4 shadow-[0_24px_54px_rgba(11,24,77,0.1)] backdrop-blur-2xl md:p-5 lg:p-6";

  const kickerText = mode === "compact" ? "Book this presentation" : "Plan your visit";
  const helperText = useMemo(
    () =>
      mode === "page"
        ? "Choose your sessions here, then confirm everything in the request form."
        : mode === "compact"
          ? "Pick a date, time, and region, then send your request."
          : "Book your school presentation",
    [mode]
  );
  // Date and Time always share a row below the wide four-column layout;
  // Presentation and Region take the full row there.
  const fieldsGridClassName =
    mode === "compact"
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
      : "grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.15fr_0.95fr_1fr_1fr]";
  const fullRowFieldClassName =
    mode === "compact" ? "sm:col-span-2" : "sm:col-span-2 xl:col-span-1";
  const footerClassName =
    mode === "compact"
      ? "mt-5 flex flex-col gap-4"
      : "mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between";
  const canOpenReview = sessions.every(
    (session) =>
      Boolean(session.presentationSlug) &&
      Boolean(session.date) &&
      Boolean(session.startTime) &&
      Boolean(session.regionSlug) &&
      (!isOtherRegionSlug(session.regionSlug) || Boolean(session.customRegion?.trim()))
  );
  const canLaunchRequest = canOpenReview && Boolean(bookingModal);

  return (
    <div id="regions" className={shellClassName}>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
          {kickerText}
        </p>
        <p className="text-2xl font-bold tracking-[-0.03em] text-[color:var(--navy)] md:text-[1.7rem]">
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

              <div className={fieldsGridClassName}>
                <Field
                  icon={<MonitorPlay className="h-4 w-4" />}
                  label="Presentation"
                  className={fullRowFieldClassName}
                >
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
                  <BookingDatePicker
                    value={session.date}
                    minDate={firstDate}
                    maxDate={maxBookableDate}
                    isDateBookable={(date) => isBookableDate(date, availabilityConfig)}
                    onChange={(nextDate) =>
                      setSessions((current) =>
                        current.map((item) =>
                          item.id === session.id ? { ...item, date: nextDate } : item
                        )
                      )
                    }
                  />
                </Field>

                <Field icon={<Clock3 className="h-4 w-4" />} label="Time">
                  <div>
                    <BookingTimeCombobox
                      startTime={session.startTime}
                      timeText={session.timeText}
                      placeholder="Select a time"
                      onChange={(next) =>
                        setSessions((current) =>
                          current.map((item) =>
                            item.id === session.id
                              ? { ...item, startTime: next.startTime, timeText: next.timeText }
                              : item
                          )
                        )
                      }
                    />
                    <p className="mt-2 text-xs text-[color:var(--text-soft)]">
                      Type any time between 8:00am and 4:00pm.
                    </p>
                  </div>
                </Field>

                <Field
                  icon={<MapPin className="h-4 w-4" />}
                  label="Region"
                  className={fullRowFieldClassName}
                >
                  <div>
                    <Select
                      value={session.regionSlug}
                      onChange={(event) =>
                        setSessions((current) =>
                          current.map((item) =>
                            item.id === session.id
                              ? {
                                  ...item,
                                  regionSlug: event.target.value,
                                  customRegion: isOtherRegionSlug(event.target.value)
                                    ? item.customRegion ?? ""
                                    : ""
                                }
                              : item
                          )
                        )
                      }
                    >
                      <option value="">Select your region</option>
                      {regions.map((region) => (
                        <option key={region.id} value={region.slug}>
                          {regionDisplayName(region)}
                        </option>
                      ))}
                    </Select>
                    {isOtherRegionSlug(session.regionSlug) ? (
                      <Input
                        value={session.customRegion ?? ""}
                        placeholder="Type your region"
                        aria-label="Type your region"
                        onChange={(event) =>
                          setSessions((current) =>
                            current.map((item) =>
                              item.id === session.id
                                ? { ...item, customRegion: event.target.value }
                                : item
                            )
                          )
                        }
                        className="mt-2"
                      />
                    ) : null}
                  </div>
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      <div className={footerClassName}>
        <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/70 px-4 py-2.5 text-sm text-[color:var(--text-muted)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]">
          <span>Proudly supported by</span>
          <Image src={beroccaLogo} alt="Berocca" className="h-7 w-auto object-contain" />
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
                    regionSlug: previous?.regionSlug ?? "",
                    customRegion: previous?.customRegion ?? ""
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
  children,
  className
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-white/75 bg-white/66 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.52)] backdrop-blur-xl",
        className
      )}
    >
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
  regionSlug,
  customRegion = ""
}: {
  id: string;
  presentation?: PresentationType;
  date: string;
  startTime: string;
  timeText: string;
  regionSlug: string;
  customRegion?: string;
}): HeroBookingDraftSession {
  return {
    id,
    presentationSlug: presentation?.slug ?? "",
    date,
    startTime,
    timeText,
    regionSlug,
    customRegion,
    yearLevels: presentation?.yearLevels ?? "Years 7 to 8",
    // 0 renders as an empty required field, so schools must enter their own count.
    expectedStudentCount: 0
  };
}

function normalizeSessions(current: HeroBookingDraftSession[]) {
  return current.map((session) => {
    const normalized = resolveTypedTimeInWindow(session.timeText || session.startTime);

    if (!normalized) {
      return session;
    }

    return {
      ...session,
      startTime: normalized.startTime,
      timeText: normalized.label
    };
  });
}
