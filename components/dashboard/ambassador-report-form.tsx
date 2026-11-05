"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  FileCheck2,
  Images,
  MessageSquareQuote,
  MessageSquareText,
  Presentation,
  School2,
  Star,
  UserRound
} from "lucide-react";

import { ReportMediaUpload } from "@/components/dashboard/report-media-upload";
import { StarRatingInput } from "@/components/site/star-rating-input";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { TruncatedText } from "@/components/ui/truncated-text";
import { Textarea } from "@/components/ui/textarea";
import type { BookingSessionView } from "@/lib/domain/types";
import { additionalCentsForTier, classifyReportGroup, reviewReasonLabel } from "@/lib/payment-breakdown";
import { groupReportVisits, sessionGroupSummary } from "@/lib/same-day-sessions";
import { formatCurrency, formatDate, formatTime, formatWeekdayDate } from "@/lib/utils";

// What the day's sessions add to the one delivery fee, if the report meets the
// attendance threshold (0056 tiers, gap measured from the first session's end
// to the second's start). Indicative only: the amount is set when the report
// is saved, and anything outside the two automatic tiers is set by staff.
export function GroupPaymentNote({ sessions }: { sessions: BookingSessionView[] }) {
  const group = classifyReportGroup(sessions);

  if (group.tier === "single") {
    return null;
  }

  if (group.tier === "custom_review") {
    return (
      <p
        data-testid="group-payment-note"
        className="rounded-[14px] border border-[#f5d48a] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a5a00]"
      >
        Payment for these sessions is set by staff after a review, not automatically. {reviewReasonLabel(group.reviewReason, group.gapMinutes)}
      </p>
    );
  }

  return (
    <p
      data-testid="group-payment-note"
      className="rounded-[14px] border border-[#b9e2c7] bg-[#f4fbf6] px-4 py-3 text-sm text-[#1d6f35]"
    >
      Payment: one delivery fee plus {formatCurrency(additionalCentsForTier(group.tier))} for the second session, which
      starts {group.gapMinutes} minutes after the first one ends
      {group.tier === "pair_within_60" ? " (less than 2 hours)" : " (2 to 4 hours)"}.
    </p>
  );
}

const RATING_ROWS = [
  { name: "attendanceRating", label: "Attendance" },
  { name: "studentEngagementRating", label: "Student response" },
  { name: "teacherResponseRating", label: "Teacher response" },
  { name: "presentationEnergyRating", label: "Presentation energy" }
];

function nzDateValue(iso?: string) {
  if (!iso) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}

function nzTimeValue(iso?: string) {
  if (!iso) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Pacific/Auckland",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

export function AmbassadorReportForm({
  sessions,
  initialSessionId,
  presenterName,
  action
}: {
  sessions: BookingSessionView[];
  initialSessionId?: string;
  presenterName: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const initialSession = sessions.find((session) => session.id === initialSessionId) ?? sessions[0];
  const [selectedSessionId, setSelectedSessionId] = useState(initialSession?.id ?? "");
  const session = sessions.find((item) => item.id === selectedSessionId) ?? initialSession;
  // Everything delivered at one school in one week goes on one report.
  const visits = groupReportVisits(sessions);
  const visit = visits.find((days) => days.flat().some((item) => item.id === session?.id)) ?? [];
  const sessionDay = visit[0] ?? [];
  const isMultiDay = visit.length > 1;
  const visitSessions = visit.flat();
  const summary = sessionGroupSummary(visitSessions, true);
  const anchor = sessionDay[0] ?? session;

  if (!session) {
    return (
      <div className="surface-panel rounded-[32px] p-6 text-center md:p-8">
        <Presentation className="mx-auto h-7 w-7 text-[color:var(--text-soft)]" aria-hidden="true" />
        <h2 className="mt-3 text-xl font-semibold text-[color:var(--navy)]">No completed bookings need a report</h2>
        <p className="mt-1 text-sm text-[color:var(--text-soft)]">A report becomes available after an assigned school booking is completed.</p>
      </div>
    );
  }

  return (
    <div className="surface-panel rounded-[32px] p-6 md:p-7">
      <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
        {`${summary.presentationTitles.join(" + ")} at ${session.schoolName}`}
      </h2>

      <form key={anchor.id} action={action} className="mt-5 grid gap-5">
        <input type="hidden" name="bookingSessionId" value={anchor.id} />
        <input type="hidden" name="returnTo" value="/ambassador/reports" />

        <ReportSection title="Completed school booking" icon={School2}>
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-[color:var(--navy)]">Select the session you’re reporting on</span>
            <select
              value={anchor.id}
              onChange={(event) => setSelectedSessionId(event.target.value)}
              className="min-h-[36px] w-full rounded-[8px] border border-[color:var(--border-soft)] bg-white px-3 text-[12px] text-[color:var(--navy)] outline-none focus:border-[#9fd4ad]"
            >
              {visits.map((days) => {
                const option = days[0][0];

                return (
                  <option key={option.id} value={option.id}>
                    {option.schoolName} ·{" "}
                    {days.length > 1
                      ? `${days.length} days (${days.map((day) => formatDate(day[0].startsAt)).join(" & ")})`
                      : formatDate(option.startsAt)}
                    {days.length === 1 && days[0].length > 1
                      ? ` · ${days[0].length} sessions (${days[0].map((item) => formatTime(item.startsAt)).join(" & ")})`
                      : days.length === 1
                        ? ` · ${option.presentationTitle}`
                        : ""}
                  </option>
                );
              })}
            </select>
          </label>
          {isMultiDay ? (
            <p className="rounded-[14px] border border-[#c8dcfb] bg-[#f5f9ff] px-4 py-3 text-sm text-[#1e4fae]">
              This one report covers your whole visit to {session.schoolName}: {visitSessions.length} sessions over{" "}
              {visit.length} days. Enter the students for each day below, and each day is paid separately.
            </p>
          ) : sessionDay.length > 1 ? (
            <p className="rounded-[14px] border border-[#c8dcfb] bg-[#f5f9ff] px-4 py-3 text-sm text-[#1e4fae]">
              This one report covers all {sessionDay.length} sessions you delivered at {session.schoolName} on this
              day ({sessionDay.map((item) => formatTime(item.startsAt)).join(" and ")}). Enter the total number of
              students across them.
            </p>
          ) : null}
          {isMultiDay ? null : <GroupPaymentNote sessions={sessionDay} />}
          <div className="grid gap-3 rounded-[18px] bg-[#f6f9fd] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <BookingFact label="School" value={session.schoolName} />
            <BookingFact label="Presentation" value={summary.presentationTitles.join(" + ")} />
            <BookingFact label="Location" value={session.regionName ?? session.regionSlug} />
            <BookingFact label="School contact" value={session.contactName ?? "Recorded by the school team"} />
          </div>
          <input type="hidden" name="schoolName" value={session.schoolName} />
          <input type="hidden" name="primaryContactName" value={session.contactName ?? ""} />
          <input type="hidden" name="primaryContactEmail" value={session.contactEmail ?? ""} />
          <input type="hidden" name="regionLocation" value={[session.regionName, session.schoolAddress].filter(Boolean).join(" · ")} />
        </ReportSection>

        <ReportSection title="Presenter" icon={UserRound}>
          <ReportField label="Presenter name *">
            <Input name="presenterName" defaultValue={presenterName} required />
          </ReportField>
        </ReportSection>

        {isMultiDay ? (
          <>
            <input type="hidden" name="deliveredDate" value={nzDateValue(anchor.startsAt)} />
            <input type="hidden" name="deliveredTime" value={nzTimeValue(anchor.startsAt)} />
          </>
        ) : (
          <ReportSection title="When was the presentation delivered? *" icon={CalendarClock}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReportField label="Date">
                <Input
                  name="deliveredDate"
                  type="date"
                  defaultValue={nzDateValue(session.startsAt)}
                  required
                />
              </ReportField>
              <ReportField label="Time">
                <Input
                  name="deliveredTime"
                  type="time"
                  defaultValue={nzTimeValue(session.startsAt)}
                  required
                />
              </ReportField>
            </div>
          </ReportSection>
        )}

        <ReportSection title="About the session" icon={Presentation}>
          <YesNoQuestion
            name="studentsCompeted"
            question="Did you have the students compete in an esports event? *"
          />
          {isMultiDay ? (
            <div className="grid gap-3">
              <input type="hidden" name="attendeeCount" value="0" />
              {visit.map((day) => (
                <div key={day[0].id} className="grid gap-2 rounded-[14px] border border-[color:var(--border-soft)] bg-white p-3">
                  <input type="hidden" name="reportDaySessionId" value={day[0].id} />
                  <ReportField
                    label={`${formatWeekdayDate(day[0].startsAt)} · ${day.map((item) => formatTime(item.startsAt)).join(" & ")} *`}
                    hint="Students reached this day. The school’s estimate is prefilled, so confirm or correct it."
                  >
                    <Input
                      name={`reportDayAttendees:${day[0].id}`}
                      type="number"
                      min={0}
                      defaultValue={sessionGroupSummary(day, true).studentCount}
                      required
                    />
                  </ReportField>
                  <GroupPaymentNote sessions={day} />
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {isMultiDay ? null : (
              <ReportField
                label="Students reached *"
                hint="The school’s booking estimate is prefilled. Confirm or correct the final attendance."
              >
                <Input
                  name="attendeeCount"
                  type="number"
                  min={0}
                  defaultValue={summary.studentCount}
                  placeholder="e.g. 230"
                  required
                />
              </ReportField>
            )}
            <ReportField label="What age groups were presented to? *">
              <Input
                name="ageGroups"
                defaultValue={summary.yearLevels.join(" / ")}
                placeholder="e.g. Years 7 to 8"
                required
              />
            </ReportField>
          </div>
          <YesNoQuestion name="parentsPresent" question="Were any parents present? *" />
        </ReportSection>

        <ReportSection title="Presentation photos / videos" icon={Images}>
          <ReportMediaUpload uploader="ambassador" />
          <label className="flex items-center gap-3 rounded-[16px] border border-[color:var(--border-soft)] bg-[#f6f9fd] px-4 py-3 text-sm text-[color:var(--navy)]">
            <input type="checkbox" name="mediaConsentObtained" />
            Media consent was checked or obtained where needed.
          </label>
        </ReportSection>

        <ReportSection title="Did you capture any thoughts or quotes from attendees?" icon={MessageSquareQuote}>
          <ReportField label="If so, share them here">
            <Textarea
              name="attendeeQuotes"
              className=""
              placeholder="“I didn't know esports had real jobs behind it.” — Year 12 student"
            />
          </ReportField>
          <ReportField label="Any notable student questions or themes?">
            <Textarea
              name="notableQuestions"
              className=""
              placeholder="Careers in casting, screen-time balance, how to start a school club..."
            />
          </ReportField>
        </ReportSection>

        <ReportSection title="How did you feel the presentation went? *" icon={Star}>
          <div className="grid gap-3">
            {RATING_ROWS.map((row) => (
              <RatingRow key={row.name} name={row.name} label={row.label} />
            ))}
          </div>
          <p className="text-xs text-[color:var(--text-soft)]">1 = poor · 5 = excellent</p>
        </ReportSection>

        <ReportSection title="Presentation feedback *" icon={MessageSquareText}>
          <ReportField label="Do you have any feedback you'd like us to consider for future presentations?">
            <Textarea
              name="presentationFeedback"
              className=""
              placeholder="What landed well, what you'd change, and anything the team should know."
              required
            />
          </ReportField>
          <ReportField label="Additional notes (optional)">
            <Textarea name="additionalNotes" className="" />
          </ReportField>
        </ReportSection>

        <div className="flex justify-end border-t border-[color:var(--border-soft)] pt-5">
          <Button
            type="submit"
          >
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            Submit report
          </Button>
        </div>
      </form>
    </div>
  );
}

function ReportSection({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#e8f1fd] text-[#1e4fae]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-base font-semibold tracking-[-0.02em] text-[color:var(--navy)]">{title}</h3>
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function ReportField({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
        {label}
        {hint ? <InfoTooltip label={label}>{hint}</InfoTooltip> : null}
      </span>
      {children}
    </label>
  );
}

function BookingFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">{label}</p>
      <TruncatedText className="mt-1 text-sm font-semibold text-[color:var(--navy)]" title={value}>{value}</TruncatedText>
    </div>
  );
}

function YesNoQuestion({ name, question }: { name: string; question: string }) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold text-[color:var(--navy)]">{question}</p>
      <div className="grid grid-cols-2 gap-3 sm:max-w-[420px]">
        {["yes", "no"].map((value) => (
          <label key={value} className="cursor-pointer">
            <input type="radio" name={name} value={value} required className="peer sr-only" />
            <span className="flex min-h-[46px] items-center justify-center rounded-[14px] border border-[#c4dbfb] bg-white text-sm font-semibold uppercase tracking-[0.08em] text-[#1e4fae] transition peer-checked:border-[#2563eb] peer-checked:bg-[#2563eb] peer-checked:text-white">
              {value === "yes" ? "Yes" : "No"}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RatingRow({ name, label }: { name: string; label: string }) {
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
      <p className="text-sm font-medium text-[color:var(--navy)]">{label}</p>
      <StarRatingInput name={name} label={label} />
    </div>
  );
}
