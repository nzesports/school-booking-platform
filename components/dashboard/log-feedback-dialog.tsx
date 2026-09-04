"use client";

import { Check, ChevronDown, MessageSquarePlus, Plus, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { StarRatingInput } from "@/components/site/star-rating-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type FeedbackSessionOption = {
  id: string;
  schoolName: string;
  presentationTitle: string;
  startsAt: string;
  yearLevels: string;
  attendeeCount: number;
  contactName?: string;
  contactEmail?: string;
  assignedAmbassadorName?: string;
};

export type FeedbackPresentationOption = {
  id: string;
  title: string;
  yearLevels: string;
};

const selectClassName =
  "w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)] outline-none transition focus:border-[color:rgba(24,168,59,0.34)] focus:ring-4 focus:ring-[rgba(24,168,59,0.1)]";

const ratingRows = [
  { name: "attendanceRating", label: "Attendance" },
  { name: "studentEngagementRating", label: "Student response" },
  { name: "teacherResponseRating", label: "Teacher response" },
  { name: "presentationEnergyRating", label: "Presentation energy" }
] as const;

function nzDateValue(iso?: string) {
  if (!iso) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}

function nzTimeValue(iso?: string) {
  if (!iso) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Pacific/Auckland",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

function displayDate(iso: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(iso));
}

function sessionLabel(session: FeedbackSessionOption) {
  return `${session.schoolName} · ${session.presentationTitle} · ${displayDate(session.startsAt)}`;
}

export function LogFeedbackDialog({
  sessions,
  schoolNames,
  presentations,
  defaultPresenterName,
  action,
  returnTo
}: {
  sessions: FeedbackSessionOption[];
  schoolNames: string[];
  presentations: FeedbackPresentationOption[];
  defaultPresenterName: string;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  const firstSession = sessions[0];
  const [open, setOpen] = useState(false);
  const [sessionMode, setSessionMode] = useState<"existing" | "manual">(
    firstSession ? "existing" : "manual"
  );
  const [sessionId, setSessionId] = useState(firstSession?.id ?? "");
  const [sessionQuery, setSessionQuery] = useState(
    firstSession ? sessionLabel(firstSession) : "Session wasn’t booked — enter it manually"
  );
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [manualPresentationId, setManualPresentationId] = useState(presentations[0]?.id ?? "");
  const selectedSession =
    sessionMode === "existing"
      ? sessions.find((session) => session.id === sessionId)
      : undefined;
  const selectedManualPresentation = presentations.find(
    (presentation) => presentation.id === manualPresentationId
  );
  const normalizedQuery =
    sessionMode === "manual" ||
    (selectedSession && sessionQuery === sessionLabel(selectedSession))
      ? ""
      : sessionQuery.trim().toLowerCase();
  const matchingSessions = sessions
    .filter((session) =>
      [
        session.schoolName,
        session.presentationTitle,
        session.assignedAmbassadorName,
        displayDate(session.startsAt)
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))
    )
    .slice(0, 12);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="min-h-[50px] rounded-[16px] border-[#c4dbfb] bg-[#e8f1fd] px-5 text-[#1e4fae] hover:bg-[#dcebfc]"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Log feedback
      </Button>

      {open
        ? createPortal(
            <BookingDialogShell
              kicker="Staff entry"
              title="Log presentation feedback"
              onClose={() => setOpen(false)}
              maxWidthClassName="max-w-[1040px]"
              overlayClassName="z-[90]"
              compact
            >
              <form
                action={action}
                className="mt-6 grid gap-5"
                onSubmit={(event) => {
                  if (sessionMode === "existing" && !selectedSession) {
                    event.preventDefault();
                    setSessionError(true);
                    setSessionListOpen(true);
                  }
                }}
              >
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="sessionMode" value={sessionMode} />
                <input type="hidden" name="bookingSessionId" value={sessionId} />

                <FeedbackSection title="Presentation">
                  <div className="grid gap-1.5">
                    <span className="text-sm font-semibold text-[color:var(--navy)]">
                      Completed session or manual entry *
                    </span>
                    <div
                      className="relative"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setSessionListOpen(false);
                        }
                      }}
                    >
                      <div className="flex min-h-[52px] items-center gap-2 rounded-[18px] border border-[color:var(--border-soft)] bg-white px-4 focus-within:border-[color:rgba(24,168,59,0.34)] focus-within:ring-4 focus-within:ring-[rgba(24,168,59,0.1)]">
                        <Search className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                        <input
                          role="combobox"
                          aria-label="Search completed sessions"
                          aria-expanded={sessionListOpen}
                          aria-controls="feedback-session-options"
                          aria-autocomplete="list"
                          value={sessionQuery}
                          onFocus={() => setSessionListOpen(true)}
                          onChange={(event) => {
                            setSessionQuery(event.target.value);
                            setSessionMode("existing");
                            setSessionId("");
                            setSessionError(false);
                            setSessionListOpen(true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setSessionListOpen(false);
                          }}
                          placeholder="Type a school, presentation, presenter, or date..."
                          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-[color:var(--text-soft)]"
                          required={sessionMode === "existing"}
                        />
                        <button
                          type="button"
                          aria-label="Show completed sessions"
                          onClick={() => setSessionListOpen((current) => !current)}
                          className="rounded-lg p-1 text-[color:var(--navy)]"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>

                      {sessionListOpen ? (
                        <div
                          id="feedback-session-options"
                          role="listbox"
                          className="absolute inset-x-0 top-[calc(100%+8px)] z-20 max-h-80 overflow-y-auto rounded-[18px] border border-[color:var(--border-soft)] bg-white p-2 shadow-[0_20px_50px_rgba(11,24,77,0.18)]"
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={sessionMode === "manual"}
                            onClick={() => {
                              setSessionMode("manual");
                              setSessionId("");
                              setSessionQuery("Session wasn’t booked — enter it manually");
                              setSessionError(false);
                              setSessionListOpen(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left text-sm font-semibold text-[#1e4fae] transition hover:bg-[#eef6ff]"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8f1fd]">
                              <Plus className="h-4 w-4" />
                            </span>
                            Session wasn’t booked — enter it manually
                          </button>

                          <div className="my-2 border-t border-[color:var(--border-soft)]" />

                          {matchingSessions.length > 0 ? (
                            matchingSessions.map((session) => (
                              <button
                                key={session.id}
                                type="button"
                                role="option"
                                aria-selected={session.id === sessionId}
                                onClick={() => {
                                  setSessionMode("existing");
                                  setSessionId(session.id);
                                  setSessionQuery(sessionLabel(session));
                                  setSessionError(false);
                                  setSessionListOpen(false);
                                }}
                                className={cn(
                                  "flex w-full items-start justify-between gap-3 rounded-[14px] px-3 py-3 text-left text-sm transition hover:bg-[#f5f9fd]",
                                  session.id === sessionId
                                    ? "bg-[color:var(--green-soft)] text-[color:var(--navy)]"
                                    : "text-[color:var(--text-dark)]"
                                )}
                              >
                                <span>{sessionLabel(session)}</span>
                                {session.id === sessionId ? (
                                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--green)]" />
                                ) : null}
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-4 text-sm text-[color:var(--text-soft)]">
                              No completed sessions match that search.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                    {sessionError ? (
                      <p className="text-xs font-semibold text-[#b42318]">
                        Choose a session from the results, or select manual entry.
                      </p>
                    ) : null}
                  </div>

                  {sessionMode === "manual" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <FeedbackField label="School name *">
                        <Input
                          name="manualSchoolName"
                          list="feedback-school-options"
                          placeholder="Start typing a school name"
                          required
                        />
                        <datalist id="feedback-school-options">
                          {schoolNames.map((schoolName) => (
                            <option key={schoolName} value={schoolName} />
                          ))}
                        </datalist>
                      </FeedbackField>
                      <FeedbackField label="Presentation *">
                        <select
                          name="manualPresentationTypeId"
                          value={manualPresentationId}
                          onChange={(event) => setManualPresentationId(event.target.value)}
                          className={selectClassName}
                          required
                        >
                          {presentations.map((presentation) => (
                            <option key={presentation.id} value={presentation.id}>
                              {presentation.title}
                            </option>
                          ))}
                        </select>
                      </FeedbackField>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <FeedbackField label="Presenter name *">
                      <Input
                        key={`${sessionMode}-${selectedSession?.id ?? "manual"}-presenter`}
                        name="presenterName"
                        defaultValue={
                          selectedSession?.assignedAmbassadorName ?? defaultPresenterName
                        }
                        placeholder="Staff member or presenter"
                        required
                      />
                    </FeedbackField>
                    <FeedbackField label="Total school roll size">
                      <Input name="schoolRollSize" type="number" min={0} />
                    </FeedbackField>
                    <FeedbackField label="Primary contact name">
                      <Input
                        key={`${sessionMode}-${selectedSession?.id ?? "manual"}-contact-name`}
                        name="primaryContactName"
                        defaultValue={selectedSession?.contactName ?? ""}
                      />
                    </FeedbackField>
                    <FeedbackField label="Primary contact email">
                      <Input
                        key={`${sessionMode}-${selectedSession?.id ?? "manual"}-contact-email`}
                        name="primaryContactEmail"
                        type="email"
                        defaultValue={selectedSession?.contactEmail ?? ""}
                      />
                    </FeedbackField>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FeedbackField label="Delivered date *">
                      <Input
                        key={`${sessionMode}-${selectedSession?.id ?? "manual"}-date`}
                        name="deliveredDate"
                        type="date"
                        defaultValue={nzDateValue(selectedSession?.startsAt)}
                        required
                      />
                    </FeedbackField>
                    <FeedbackField label="Delivered time *">
                      <Input
                        key={`${sessionMode}-${selectedSession?.id ?? "manual"}-time`}
                        name="deliveredTime"
                        type="time"
                        defaultValue={nzTimeValue(selectedSession?.startsAt)}
                        required
                      />
                    </FeedbackField>
                  </div>
                </FeedbackSection>

                <FeedbackSection title="Session details">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FeedbackField label="Attendees *">
                      <Input
                        key={`${sessionMode}-${selectedSession?.id ?? "manual"}-attendees`}
                        name="attendeeCount"
                        type="number"
                        min={0}
                        defaultValue={selectedSession?.attendeeCount ?? ""}
                        required
                      />
                    </FeedbackField>
                    <FeedbackField label="Age groups *">
                      <Input
                        key={`${sessionMode}-${selectedSession?.id ?? manualPresentationId}-ages`}
                        name="ageGroups"
                        defaultValue={
                          selectedSession?.yearLevels ?? selectedManualPresentation?.yearLevels ?? ""
                        }
                        required
                      />
                    </FeedbackField>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <YesNoQuestion
                      name="studentsCompeted"
                      question="Did students compete in an esports activity? *"
                    />
                    <YesNoQuestion name="parentsPresent" question="Were parents present? *" />
                  </div>
                </FeedbackSection>

                <FeedbackSection title="Photos, video & evidence">
                  <p className="text-sm leading-6 text-[color:var(--text-soft)]">
                    Add presentation photos, video, PDFs, or a signed media release. These files
                    will appear in the report&apos;s media gallery for staff and admins. Up to 15
                    files, 5 MB each.
                  </p>
                  <input
                    type="file"
                    name="mediaFiles"
                    multiple
                    accept=".png,.jpg,.jpeg,.webp,.mp4,.mov,.webm,.avi,.pdf"
                    className="w-full rounded-[16px] border border-dashed border-[color:var(--border-soft)] bg-white px-4 py-4 text-sm text-[color:var(--navy)]"
                  />
                  <label className="flex items-center gap-3 rounded-[16px] border border-[color:var(--border-soft)] bg-[#f6f9fd] px-4 py-3 text-sm text-[color:var(--navy)]">
                    <input type="checkbox" name="mediaConsentObtained" />
                    Media consent was checked or obtained where needed.
                  </label>
                </FeedbackSection>

                <FeedbackSection title="Ratings">
                  <div className="grid gap-4 md:grid-cols-2">
                    {ratingRows.map((rating) => (
                      <div key={rating.name} className="grid gap-2">
                        <p className="text-sm font-semibold text-[color:var(--navy)]">
                          {rating.label} *
                        </p>
                        <StarRatingInput name={rating.name} label={rating.label} />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[color:var(--text-soft)]">
                    1 = poor · 5 = excellent
                  </p>
                </FeedbackSection>

                <FeedbackSection title="Written feedback">
                  <FeedbackField label="Presentation feedback *">
                    <Textarea
                      name="presentationFeedback"
                      className="min-h-24"
                      placeholder="What landed well, what should change, and anything the team should know."
                      required
                    />
                  </FeedbackField>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FeedbackField label="Attendee thoughts or quotes">
                      <Textarea name="attendeeQuotes" className="min-h-20" />
                    </FeedbackField>
                    <FeedbackField label="Notable questions or themes">
                      <Textarea name="notableQuestions" className="min-h-20" />
                    </FeedbackField>
                  </div>
                  <FeedbackField label="Additional notes">
                    <Textarea name="additionalNotes" className="min-h-16" />
                  </FeedbackField>
                </FeedbackSection>

                <div className="flex justify-end gap-3 border-t border-[color:var(--border-soft)] pt-5">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <PendingSubmitButton type="submit" pendingLabel="Logging feedback...">
                    Log feedback
                  </PendingSubmitButton>
                </div>
              </form>
            </BookingDialogShell>,
            document.body
          )
        : null}
    </>
  );
}

function FeedbackSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
      <h3 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">{title}</h3>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function FeedbackField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-[color:var(--navy)]">{label}</span>
      {children}
    </label>
  );
}

function YesNoQuestion({ name, question }: { name: string; question: string }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold text-[color:var(--navy)]">{question}</legend>
      <div className="grid grid-cols-2 gap-3">
        {["yes", "no"].map((value) => (
          <label key={value} className="cursor-pointer">
            <input type="radio" name={name} value={value} required className="peer sr-only" />
            <span className="flex min-h-[44px] items-center justify-center rounded-[14px] border border-[#c4dbfb] bg-white text-sm font-semibold uppercase tracking-[0.08em] text-[#1e4fae] transition peer-checked:border-[#2563eb] peer-checked:bg-[#2563eb] peer-checked:text-white">
              {value === "yes" ? "Yes" : "No"}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
