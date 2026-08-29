"use client";

import Image from "next/image";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Layers3,
  MapPin,
  MonitorPlay,
  PencilLine,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UsersRound
} from "lucide-react";

import beroccaLogo from "@/public/media/berocca-logo.png";

import type { BookingFormState } from "@/app/actions";
import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { BookingDatePicker, BookingTimeCombobox } from "@/components/site/booking-field-pickers";
import type { HeroBookingDraftSession } from "@/components/site/hero-booking-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isOtherRegionSlug, regionDisplayName } from "@/lib/domain/regions";
import { cn } from "@/lib/utils";
import type { BookingContactDefaults, PresentationType, Region } from "@/lib/domain/types";
import { storeGuestBookingDefaults } from "@/lib/services/guest-booking-defaults";
import {
  BOOKING_WINDOW_DAYS,
  type AvailabilityConfig,
  bookingDateState,
  isBookableDate,
  maximumBookingDate,
  minimumBookingDate,
  nextBookableDates
} from "@/lib/services/availability";
import {
  addTenMinutes,
  formatDisplayDate,
  formatTimeLabel,
  resolveTypedTimeInWindow
} from "@/lib/services/time-slots";

type BookingStep = "plan" | "review";

export function BookingModalHost({
  request,
  onClose,
  presentations,
  regions,
  availabilityConfig,
  action
}: {
  request: {
    id: number;
    initialStep?: "plan" | "review";
    presentationSlug?: string;
    regionSlug?: string;
    date?: string;
    time?: string;
    sessions?: HeroBookingDraftSession[];
  } | null;
  onClose: () => void;
  presentations: PresentationType[];
  regions: Region[];
  availabilityConfig?: AvailabilityConfig;
  action: (state: BookingFormState, formData: FormData) => Promise<BookingFormState>;
}) {
  useEffect(() => {
    if (!request) {
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
  }, [onClose, request]);

  if (!request) {
    return null;
  }

  return (
    <BookingModalFlow
      key={request.id}
      presentations={presentations}
      regions={regions}
      availabilityConfig={availabilityConfig}
      action={action}
      initialStep={request.initialStep}
      initialPresentationSlug={request.presentationSlug}
      initialRegionSlug={request.regionSlug}
      initialDate={request.date}
      initialTime={request.time}
      initialSessions={request.sessions}
      onClose={onClose}
    />
  );
}

function BookingModalFlow({
  presentations,
  regions,
  availabilityConfig,
  action,
  initialStep,
  initialPresentationSlug,
  initialRegionSlug,
  initialDate,
  initialTime,
  initialSessions,
  onClose
}: {
  presentations: PresentationType[];
  regions: Region[];
  availabilityConfig?: AvailabilityConfig;
  action: (state: BookingFormState, formData: FormData) => Promise<BookingFormState>;
  initialStep?: BookingStep;
  initialPresentationSlug?: string;
  initialRegionSlug?: string;
  initialDate?: string;
  initialTime?: string;
  initialSessions?: HeroBookingDraftSession[];
  onClose: () => void;
}) {
  const dates = nextBookableDates(BOOKING_WINDOW_DAYS, availabilityConfig);
  const firstDate =
    dates.includes(initialDate ?? "") && initialDate ? initialDate : dates[0] ?? "";
  const minBookableDate = minimumBookingDate();
  const maxBookableDate = maximumBookingDate();
  const initialPresentation =
    presentations.find((item) => item.slug === initialPresentationSlug) ?? presentations[0];
  const preferredInitialTime = (initialTime ? resolveTypedTimeInWindow(initialTime) : null) ?? {
    startTime: "",
    label: ""
  };
  const firstRegionSlug =
    regions.find((item) => item.slug === initialRegionSlug)?.slug ?? "";
  const initialDraftSessions =
    initialSessions && initialSessions.length > 0
      ? hydrateInitialSessions({
          sessions: initialSessions.slice(0, 5),
          presentations,
          regions,
          dates,
          fallbackDate: firstDate,
          fallbackPresentation: initialPresentation
        })
      : [
          createDraftSession({
            id: "session-1",
            presentation: initialPresentation,
            date: firstDate,
            startTime: preferredInitialTime.startTime,
            timeText: preferredInitialTime.label,
            regionSlug: firstRegionSlug
          })
        ];
  const initialCanContinue = initialDraftSessions.every(
    (session) =>
      Boolean(session.presentationSlug) &&
      Boolean(session.date) &&
      Boolean(session.startTime) &&
      Boolean(session.regionSlug) &&
      (!isOtherRegionSlug(session.regionSlug) || Boolean(session.customRegion?.trim()))
  );

  const [step, setStep] = useState<BookingStep>(
    initialStep === "review" && !initialCanContinue ? "plan" : initialStep ?? "plan"
  );
  const [nextSessionNumber, setNextSessionNumber] = useState(initialDraftSessions.length + 1);
  const [sessions, setSessions] = useState<HeroBookingDraftSession[]>(initialDraftSessions);
  const [isReturningToDetails, setIsReturningToDetails] = useState(false);
  const [bookingState, bookingFormAction] = useActionState(action, null);
  const [contactDefaultsLoading, setContactDefaultsLoading] = useState(true);
  const [contactDetails, setContactDetails] = useState<BookingContactDefaults>({
    schoolName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    regionSlug: ""
  });

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    fetch("/api/booking/defaults", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load booking defaults.");
        }

        return response.json() as Promise<{ defaults: BookingContactDefaults | null }>;
      })
      .then(({ defaults }) => {
        if (!defaults || !isActive) {
          return;
        }

        setContactDetails(defaults);
        setSessions((current) =>
          current.map((session) =>
            session.regionSlug || !defaults.regionSlug
              ? session
              : { ...session, regionSlug: defaults.regionSlug }
          )
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      })
      .finally(() => {
        if (isActive) {
          setContactDefaultsLoading(false);
        }
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  const reviewSessions = normalizeSessions(sessions);
  const canContinueToReview = sessions.every(
    (session) =>
      Boolean(session.presentationSlug) &&
      Boolean(session.date) &&
      Boolean(session.startTime) &&
      Boolean(session.regionSlug) &&
      (!isOtherRegionSlug(session.regionSlug) || Boolean(session.customRegion?.trim()))
  );

  return (
    <BookingDialogShell
      title={
        step === "plan"
          ? "Book your school presentation"
          : "Review and send your booking request"
      }
      description={
        step === "plan"
          ? undefined
          : "We'll check availability and confirm the session details with your school before anything is final."
      }
      onClose={onClose}
      headerAside={<BookingStepProgress currentStep={step === "plan" ? 1 : 2} />}
      maxWidthClassName="max-w-[1480px]"
      overlayClassName="z-[60]"
    >
      {step === "plan" ? (
        <div className="mt-5 overflow-hidden rounded-[32px] border border-[rgba(164,202,227,0.48)] bg-[linear-gradient(180deg,rgba(248,252,255,0.96),rgba(255,255,255,0.98))] shadow-[0_30px_68px_rgba(11,24,77,0.12)]">
          <div className="px-5 py-5 md:px-7 lg:px-8">
            <div className="grid gap-4">
            {sessions.map((session, index) => {
              const selectedDateIsBookable = isBookableDate(session.date, availabilityConfig);
              const selectedPresentation = presentations.find(
                (presentation) => presentation.slug === session.presentationSlug
              );

              return (
                <div
                  key={session.id}
                  className="rounded-[26px] border border-[rgba(164,202,227,0.42)] bg-[linear-gradient(180deg,rgba(243,249,255,0.84),rgba(255,255,255,0.94))] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.62)] md:p-5"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(164,202,227,0.28)] text-[color:var(--navy)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.62)]">
                        <UsersRound className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-[color:var(--navy)]">
                        Session {index + 1}
                      </p>
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

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.15fr_0.95fr_1fr_1fr]">
                    <PlannerField
                      icon={<MonitorPlay className="h-4 w-4" />}
                      label="Presentation"
                      className="sm:col-span-2 xl:col-span-1"
                    >
                      <div>
                        <Select
                          className="h-[56px] text-base"
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
                                  yearLevels:
                                    nextPresentation?.yearLevels?.trim() || item.yearLevels
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
                        {selectedPresentation?.shortSummary ? (
                          <p className="mt-2 text-xs leading-5 text-[color:var(--text-soft)]">
                            {selectedPresentation.shortSummary}
                          </p>
                        ) : null}
                      </div>
                    </PlannerField>

                    <PlannerField icon={<CalendarDays className="h-4 w-4" />} label="Date">
                      <div>
                        <BookingDatePicker
                          className="min-h-[56px] text-base"
                          value={session.date}
                          minDate={minBookableDate}
                          maxDate={maxBookableDate}
                          isDateBookable={(date) => isBookableDate(date, availabilityConfig)}
                          getDateState={(date) => bookingDateState(date, availabilityConfig)}
                          onChange={(nextDate) =>
                            setSessions((current) =>
                              current.map((item) =>
                                item.id === session.id ? { ...item, date: nextDate } : item
                              )
                            )
                          }
                        />
                      </div>
                    </PlannerField>

                    <PlannerField icon={<Clock3 className="h-4 w-4" />} label="Time">
                      <div>
                        <BookingTimeCombobox
                          className="min-h-[56px] text-base"
                          startTime={session.startTime}
                          timeText={session.timeText}
                          disabled={!selectedDateIsBookable}
                          placeholder={
                            selectedDateIsBookable
                              ? "Select a time"
                              : "Choose a weekday date first"
                          }
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
                        {selectedDateIsBookable ? (
                          <p className="mt-2 text-xs text-[color:var(--text-soft)]">
                            Type any time between 8:00am and 4:00pm.
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-[#9d2424]">
                            Weekends and listed public holidays are unavailable for bookings.
                          </p>
                        )}
                      </div>
                    </PlannerField>

                    <PlannerField
                      icon={<MapPin className="h-4 w-4" />}
                      label="Region"
                      className="sm:col-span-2 xl:col-span-1"
                    >
                      <div>
                        <Select
                          className="h-[56px] text-base"
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
                          {regions.map((item) => (
                            <option key={item.id} value={item.slug}>
                              {regionDisplayName(item)}
                            </option>
                          ))}
                        </Select>
                        {isOtherRegionSlug(session.regionSlug) ? (
                          <Input
                            className="mt-2 h-[56px] text-base"
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
                          />
                        ) : null}
                      </div>
                    </PlannerField>
                  </div>
                </div>
              );
            })}
          </div>
          </div>

          <div className="border-t border-[rgba(4,15,75,0.08)] px-5 py-4 md:px-7 lg:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (sessions.length >= 5) {
                    return;
                  }

                  setSessions((current) => {
                    if (current.length >= 5) {
                      return current;
                    }

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
                        startTime: "",
                        timeText: "",
                        regionSlug: previous?.regionSlug ?? ""
                      })
                    ];
                  });
                  setNextSessionNumber((current) => current + 1);
                }}
                className="min-h-[54px] rounded-[18px] px-6 py-3 text-base"
                disabled={sessions.length >= 5}
              >
                <Plus className="h-4 w-4" />
                {sessions.length >= 5 ? "Maximum 5 sessions" : "Add another session"}
              </Button>

              <div className="flex flex-col gap-3 xl:items-end">
                <Button
                  type="button"
                  onClick={() => {
                    if (!canContinueToReview) {
                      return;
                    }

                    setSessions((current) => normalizeSessions(current));
                    setIsReturningToDetails(false);
                    setStep("review");
                  }}
                  className="min-h-[54px] rounded-[18px] px-7 py-3 text-base"
                  disabled={!canContinueToReview}
                >
                  {isReturningToDetails ? "Save and return to details" : "Continue to details"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-[rgba(4,15,75,0.08)] px-5 py-3 md:px-7 lg:px-8">
            <div className="flex flex-col gap-4 text-sm text-[color:var(--text-soft)] lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(24,168,59,0.08)] text-[color:var(--green)]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span>Proudly supported by</span>
                <Image src={beroccaLogo} alt="Berocca" className="h-7 w-auto object-contain" />
              </div>

            </div>
          </div>
        </div>
      ) : (
        <form
          action={bookingFormAction}
          className="mt-7"
          onSubmit={() => {
            storeGuestBookingDefaults({
              ...contactDetails,
              regionSlug: reviewSessions[0]?.regionSlug ?? ""
            });
          }}
        >
          <input type="hidden" name="sessionsCount" value={reviewSessions.length} />
          <input type="hidden" name="regionSlug" value={reviewSessions[0]?.regionSlug ?? ""} />

          <section className="rounded-[28px] border border-[rgba(164,202,227,0.55)] bg-[linear-gradient(180deg,rgba(243,249,255,0.95),rgba(255,255,255,0.96))] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)] md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_14px_30px_rgba(11,24,77,0.08)]">
                  <CalendarDays className="h-5 w-5 text-[color:var(--navy)]" />
                </div>
                <p className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                  {reviewSessions.length === 1 ? "Selected session" : "Selected sessions"}
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsReturningToDetails(true);
                  setStep("plan");
                }}
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
                const customRegion = session.customRegion?.trim() ?? "";
                const regionName =
                  isOtherRegionSlug(session.regionSlug) && customRegion
                    ? customRegion
                    : regions.find((item) => item.slug === session.regionSlug)?.name ??
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

                    <div className="mt-5 grid grid-cols-2 gap-x-4 md:grid-cols-4 md:gap-x-0 md:divide-x md:divide-[rgba(4,15,75,0.1)]">
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
                              Expected students <RequiredMark />
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <Input
                                name={`session-${index}-expectedStudentCount`}
                                type="number"
                                min={1}
                                value={
                                  session.expectedStudentCount > 0
                                    ? session.expectedStudentCount
                                    : ""
                                }
                                onChange={(event) => {
                                  const expectedStudentCount = Number(event.target.value || 0);

                                  setSessions((current) =>
                                    current.map((item) =>
                                      item.id === session.id
                                        ? { ...item, expectedStudentCount }
                                        : item
                                    )
                                  );
                                }}
                                aria-label={`Expected students for session ${index + 1}`}
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

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ContactField label="School name" required>
                <Input name="schoolName" placeholder="Rangitoto College" required disabled={contactDefaultsLoading} value={contactDetails.schoolName} onChange={(event) => setContactDetails((current) => ({ ...current, schoolName: event.target.value }))} />
              </ContactField>
              <ContactField label="Primary contact name" required>
                <Input name="contactName" placeholder="Jordan Smith" required disabled={contactDefaultsLoading} value={contactDetails.contactName} onChange={(event) => setContactDetails((current) => ({ ...current, contactName: event.target.value }))} />
              </ContactField>
              <ContactField label="Primary contact email" required>
                <Input name="contactEmail" type="email" placeholder="jordan@school.nz" required disabled={contactDefaultsLoading} value={contactDetails.contactEmail} onChange={(event) => setContactDetails((current) => ({ ...current, contactEmail: event.target.value }))} />
              </ContactField>
              <ContactField label="Primary contact phone" required>
                <Input name="contactPhone" placeholder="+64 21 555 123" required disabled={contactDefaultsLoading} value={contactDetails.contactPhone} onChange={(event) => setContactDetails((current) => ({ ...current, contactPhone: event.target.value }))} />
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

          {contactDefaultsLoading ? (
            <p className="mt-4 text-sm text-[color:var(--text-soft)]" aria-live="polite">
              Loading saved school details...
            </p>
          ) : null}

          {bookingState?.error ? (
            <p className="mt-5 rounded-[18px] border border-[#f3b4b4] bg-[#fff6f6] px-4 py-3 text-sm font-semibold text-[#9d2424]" role="alert">
              {bookingState.error}
            </p>
          ) : null}

          <div className="mt-6 rounded-[24px] border border-[rgba(164,202,227,0.55)] bg-[linear-gradient(180deg,rgba(243,249,255,0.95),rgba(255,255,255,0.96))] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-4 text-[color:var(--navy)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_14px_30px_rgba(11,24,77,0.08)]">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[1.4rem] font-semibold tracking-[-0.04em]">
                    {reviewSessions.length === 1
                      ? "1 session ready"
                      : `${reviewSessions.length} sessions ready`}
                  </p>
                  <p className="mt-1 text-sm leading-7 text-[color:var(--text-soft)]">
                    We&apos;ll confirm availability before your booking is final.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsReturningToDetails(true);
                    setStep("plan");
                  }}
                  className="min-h-[48px] rounded-[18px] px-6 py-2.5"
                >
                  Back to booking
                </Button>
                <PendingSubmitButton type="submit" pendingLabel="Sending request..." className="min-h-[48px] rounded-[18px] px-6 py-2.5" disabled={contactDefaultsLoading}>
                  <Send className="h-4 w-4" />
                  Send request
                </PendingSubmitButton>
              </div>
            </div>
          </div>
        </form>
      )}
    </BookingDialogShell>
  );
}

function BookingStepProgress({ currentStep }: { currentStep: 1 | 2 }) {
  const steps = [
    { step: 1 as const, label: "Choose sessions" },
    { step: 2 as const, label: "School details" }
  ];

  return (
    <div className="flex items-start justify-end">
      <div className="flex items-start gap-3 sm:gap-5">
        {steps.map((item, index) => {
          const isActive = item.step === currentStep;
          const isComplete = item.step < currentStep;

          return (
            <div key={item.step} className="flex items-center gap-2 sm:gap-4">
              <div className="text-center">
                <span
                  className={[
                    "mx-auto flex h-11 w-11 items-center justify-center rounded-full border text-base font-semibold transition",
                    isActive
                      ? "border-[color:var(--green)] bg-[color:var(--green)] text-white shadow-[0_12px_28px_rgba(24,168,59,0.22)]"
                      : isComplete
                        ? "border-[rgba(24,168,59,0.2)] bg-[rgba(24,168,59,0.08)] text-[color:var(--green)]"
                        : "border-[rgba(4,15,75,0.16)] bg-white text-[color:var(--text-soft)]"
                  ].join(" ")}
                >
                  {item.step}
                </span>
                <p
                  className={[
                    "mt-2 whitespace-nowrap text-sm font-medium",
                    isActive || isComplete
                      ? "text-[color:var(--green)]"
                      : "text-[color:var(--text-soft)]"
                  ].join(" ")}
                >
                  {item.label}
                </p>
              </div>

              {index < steps.length - 1 ? (
                <div className="mt-5 h-px w-10 bg-[rgba(4,15,75,0.14)] sm:w-28" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlannerField({
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
        "rounded-[20px] border border-[rgba(164,202,227,0.34)] bg-white/94 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]",
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

function ContactField({
  label,
  required = false,
  children
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[color:var(--navy)]">
        {label} {required ? <RequiredMark /> : null}
      </span>
      {children}
    </label>
  );
}

function RequiredMark() {
  return <span className="text-[#b42318]" aria-label="required">*</span>;
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
    yearLevels: presentation?.yearLevels?.trim() || "Years 7 to 8",
    // 0 renders as an empty required field, so schools must enter their own count.
    expectedStudentCount: 0
  };
}

function hydrateInitialSessions({
  sessions,
  presentations,
  regions,
  dates,
  fallbackDate,
  fallbackPresentation
}: {
  sessions: HeroBookingDraftSession[];
  presentations: PresentationType[];
  regions: Region[];
  dates: string[];
  fallbackDate: string;
  fallbackPresentation?: PresentationType;
}) {
  return sessions.map((session, index) => {
    const presentation =
      presentations.find((item) => item.slug === session.presentationSlug) ?? fallbackPresentation;
    const date = dates.includes(session.date) ? session.date : fallbackDate;
    const regionSlug = regions.some((item) => item.slug === session.regionSlug)
      ? session.regionSlug
      : "";
    const customRegion = isOtherRegionSlug(regionSlug) ? session.customRegion ?? "" : "";
    const normalizedTime = resolveTypedTimeInWindow(session.startTime || session.timeText) ?? {
      startTime: "",
      label: ""
    };

    return {
      id: session.id || `session-${index + 1}`,
      presentationSlug: presentation?.slug ?? "",
      date,
      startTime: normalizedTime.startTime,
      timeText: normalizedTime.label,
      regionSlug,
      customRegion,
      yearLevels: session.yearLevels || presentation?.yearLevels || "Years 7 to 8",
      expectedStudentCount:
        session.expectedStudentCount && session.expectedStudentCount > 0
          ? session.expectedStudentCount
          : 0
    };
  });
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
