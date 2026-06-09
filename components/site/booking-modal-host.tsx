"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Clock3,
  Layers3,
  MapPin,
  MonitorPlay,
  PencilLine,
  Plus,
  Send,
  Trash2,
  UsersRound
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import type { HeroBookingDraftSession } from "@/components/site/hero-booking-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PresentationType, Region } from "@/lib/domain/types";
import { buildAvailabilitySlots, nextBookableDates } from "@/lib/services/availability";

type BookingStep = "plan" | "review";

export function BookingModalHost({
  presentations,
  regions,
  action
}: {
  presentations: PresentationType[];
  regions: Region[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOpen = searchParams.get("booking") === "1";

  const closeModal = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("booking");
    params.delete("presentation");
    params.delete("region");
    params.delete("date");
    params.delete("time");

    const target = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(target, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeModal, isOpen]);

  if (!isOpen) {
    return null;
  }

  const presentation = searchParams.get("presentation") ?? undefined;
  const region = searchParams.get("region") ?? undefined;
  const date = searchParams.get("date") ?? undefined;
  const time = searchParams.get("time") ?? undefined;

  return (
    <BookingModalFlow
      key={`${presentation ?? "any"}-${region ?? "any"}-${date ?? "any"}-${time ?? "any"}`}
      presentations={presentations}
      regions={regions}
      action={action}
      initialPresentationSlug={presentation}
      initialRegionSlug={region}
      initialDate={date}
      initialTime={time}
      onClose={closeModal}
    />
  );
}

function BookingModalFlow({
  presentations,
  regions,
  action,
  initialPresentationSlug,
  initialRegionSlug,
  initialDate,
  initialTime,
  onClose
}: {
  presentations: PresentationType[];
  regions: Region[];
  action: (formData: FormData) => void | Promise<void>;
  initialPresentationSlug?: string;
  initialRegionSlug?: string;
  initialDate?: string;
  initialTime?: string;
  onClose: () => void;
}) {
  const dates = nextBookableDates(21);
  const firstDate =
    dates.includes(initialDate ?? "") && initialDate ? initialDate : dates[0] ?? "";
  const initialPresentation =
    presentations.find((item) => item.slug === initialPresentationSlug) ?? presentations[0];
  const initialSlots = buildAvailabilitySlots(firstDate);
  const preferredInitialTime = normalizeTimeToSlot(
    initialTime ?? initialSlots[0]?.startTime ?? "08:00",
    initialSlots
  );
  const firstRegionSlug =
    regions.find((item) => item.slug === initialRegionSlug)?.slug ?? regions[0]?.slug ?? "";

  const [step, setStep] = useState<BookingStep>("plan");
  const [nextSessionNumber, setNextSessionNumber] = useState(2);
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

  const reviewSessions = normalizeSessions(sessions);

  return (
    <BookingDialogShell
      kicker={step === "plan" ? "Book a presentation" : "Complete your booking"}
      title={
        step === "plan"
          ? "Build your school booking in one popup flow."
          : "Review and send your booking request"
      }
      description={
        step === "plan"
          ? "Choose the sessions you want first, then continue into the request form to submit the final school details."
          : "We'll check availability and confirm the session details with your school before anything is final."
      }
      onClose={onClose}
      maxWidthClassName="max-w-[1220px]"
      overlayClassName="z-[60]"
    >
      {step === "plan" ? (
        <div className="mt-7 rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.88))] p-5 shadow-[0_28px_62px_rgba(11,24,77,0.12)] backdrop-blur-2xl md:p-6 lg:p-7">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Plan your visit
            </p>
            <p className="text-xl font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-2xl">
              Choose your sessions here, then confirm everything in the request form.
            </p>
            <p className="max-w-3xl text-sm leading-7 text-[color:var(--text-soft)]">
              Pick the topic, date, time, and region for each session. You can type a preferred
              time or choose from the suggestion list, and we&apos;ll tidy it into the closest
              available 10-minute slot.
            </p>
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
                    <PlannerField
                      icon={<MonitorPlay className="h-4 w-4" />}
                      label="Presentation"
                    >
                      <Select
                        value={session.presentationSlug}
                        onChange={(event) =>
                          setSessions((current) =>
                            current.map((item) => {
                              if (item.id !== session.id) {
                                return item;
                              }

                              const nextPresentation = presentations.find(
                                (entry) => entry.slug === event.target.value
                              );

                              return {
                                ...item,
                                presentationSlug: event.target.value,
                                yearLevels: nextPresentation?.yearLevels ?? item.yearLevels
                              };
                            })
                          )
                        }
                      >
                        {presentations.map((item) => (
                          <option key={item.id} value={item.slug}>
                            {item.title}
                          </option>
                        ))}
                      </Select>
                    </PlannerField>

                    <PlannerField icon={<CalendarDays className="h-4 w-4" />} label="Date">
                      <Select
                        value={session.date}
                        onChange={(event) =>
                          setSessions((current) =>
                            current.map((item) => {
                              if (item.id !== session.id) {
                                return item;
                              }

                              const nextTimeOptions = buildAvailabilitySlots(event.target.value);
                              const normalized = normalizeTimeToSlot(
                                item.startTime,
                                nextTimeOptions
                              );

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
                        {dates.map((item) => (
                          <option key={item} value={item}>
                            {formatDisplayDate(item)}
                          </option>
                        ))}
                      </Select>
                    </PlannerField>

                    <PlannerField icon={<Clock3 className="h-4 w-4" />} label="Time">
                      <div>
                        <Input
                          list={`time-options-${session.id}`}
                          value={session.timeText}
                          placeholder="Type 8:30am or choose"
                          onChange={(event) =>
                            setSessions((current) =>
                              current.map((item) =>
                                item.id === session.id
                                  ? { ...item, timeText: event.target.value }
                                  : item
                              )
                            )
                          }
                          onBlur={(event) =>
                            setSessions((current) =>
                              current.map((item) => {
                                if (item.id !== session.id) {
                                  return item;
                                }

                                const normalized = normalizeTimeToSlot(
                                  event.target.value || item.startTime,
                                  timeOptions
                                );

                                return {
                                  ...item,
                                  startTime: normalized.startTime,
                                  timeText: normalized.label
                                };
                              })
                            )
                          }
                        />
                        <datalist id={`time-options-${session.id}`}>
                          {timeOptions.map((slot) => (
                            <option key={slot.startTime} value={slot.label} />
                          ))}
                        </datalist>
                        <p className="mt-2 text-xs text-[color:var(--text-soft)]">
                          Available between 8:00am and 4:00pm in 10-minute slots.
                        </p>
                      </div>
                    </PlannerField>

                    <PlannerField icon={<MapPin className="h-4 w-4" />} label="Region">
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
                        {regions.map((item) => (
                          <option key={item.id} value={item.slug}>
                            {item.name}
                          </option>
                        ))}
                      </Select>
                    </PlannerField>
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
                    const nextPresentation =
                      presentations.find((item) => item.slug === previous?.presentationSlug) ??
                      presentations[0];

                    return [
                      ...current,
                      createDraftSession({
                        id: `session-${nextSessionNumber}`,
                        presentation: nextPresentation,
                        date: previous?.date ?? firstDate,
                        startTime: previous?.startTime ?? preferredInitialTime.startTime,
                        timeText: previous?.timeText ?? preferredInitialTime.label,
                        regionSlug: previous?.regionSlug ?? firstRegionSlug
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
                variant="ghost"
                onClick={() => setSessions((current) => normalizeSessions(current))}
                className="rounded-full border border-[rgba(4,15,75,0.08)] bg-white/70 px-4 py-2.5 text-sm"
              >
                Review times
              </Button>

              <Button
                type="button"
                onClick={() => {
                  setSessions((current) => normalizeSessions(current));
                  setStep("review");
                }}
                className="min-h-[50px] rounded-[18px] px-5 py-2.5"
              >
                Book now
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <form action={action} className="mt-7">
          <input type="hidden" name="sessionsCount" value={reviewSessions.length} />
          <input type="hidden" name="regionSlug" value={reviewSessions[0]?.regionSlug ?? ""} />

          <section className="rounded-[28px] border border-[rgba(164,202,227,0.55)] bg-[linear-gradient(180deg,rgba(243,249,255,0.95),rgba(255,255,255,0.96))] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)] md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_14px_30px_rgba(11,24,77,0.08)]">
                  <CalendarDays className="h-5 w-5 text-[color:var(--navy)]" />
                </div>
                <div>
                  <p className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                    {reviewSessions.length === 1 ? "Selected session" : "Selected sessions"}
                  </p>
                  <p className="mt-1 text-sm leading-7 text-[color:var(--text-soft)]">
                    Review the session details below before you send the request.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("plan")}
                className="min-h-[46px] rounded-[16px] px-5 py-2.5 text-sm"
              >
                <PencilLine className="h-4 w-4" />
                {reviewSessions.length === 1 ? "Edit session" : "Edit sessions"}
              </Button>
            </div>

            <div className="mt-5 grid gap-4">
              {reviewSessions.map((session, index) => {
                const selectedPresentation = presentations.find(
                  (item) => item.slug === session.presentationSlug
                );
                const regionName =
                  regions.find((item) => item.slug === session.regionSlug)?.name ??
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
                            {selectedPresentation?.title ?? "Presentation"}
                          </p>
                          <span className="rounded-full bg-[color:var(--blue-soft)] px-3 py-1.5 text-sm font-semibold text-[color:var(--navy)]">
                            {session.yearLevels}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-0 divide-y divide-[rgba(4,15,75,0.1)] md:grid-cols-4 md:divide-x md:divide-y-0">
                      <SummaryItem
                        icon={<CalendarDays className="h-5 w-5" />}
                        label="Date"
                        value={formatDisplayDate(session.date)}
                      />
                      <SummaryItem
                        icon={<Clock3 className="h-5 w-5" />}
                        label="Time"
                        value={`${formatTimeLabel(session.startTime)} - ${formatTimeLabel(addTenMinutes(session.startTime))}`}
                      />
                      <SummaryItem
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
                                defaultValue={session.expectedStudentCount}
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
              <ContactField label="School name">
                <Input name="schoolName" placeholder="Rangitoto College" required />
              </ContactField>
              <ContactField label="Primary contact name">
                <Input name="contactName" placeholder="Jordan Smith" required />
              </ContactField>
              <ContactField label="Primary contact email">
                <Input name="contactEmail" type="email" placeholder="jordan@school.nz" required />
              </ContactField>
              <ContactField label="Primary contact phone">
                <Input name="contactPhone" placeholder="+64 21 555 123" required />
              </ContactField>
            </div>

            <div className="mt-4">
              <ContactField label="School notes (optional)">
                <Textarea
                  name="schoolNotes"
                  placeholder="Assembly timing, room setup, accessibility notes, or anything else the team should know."
                  className="min-h-[96px]"
                />
              </ContactField>
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
                  <p className="text-[1.4rem] font-semibold tracking-[-0.04em]">
                    {reviewSessions.length === 1
                      ? "1 session draft ready"
                      : `${reviewSessions.length} session draft ready`}
                  </p>
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
                  onClick={() => setStep("plan")}
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
      )}
    </BookingDialogShell>
  );
}

function PlannerField({
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

function ContactField({
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

function SummaryItem({
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

function addTenMinutes(value: string) {
  const [hoursString, minutesString] = value.split(":");
  const hours = Number(hoursString);
  const minutes = Number(minutesString);

  const date = new Date();
  date.setHours(hours, minutes + 10, 0, 0);

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
