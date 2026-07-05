import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BookingSessionView } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

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
  sessionId,
  session,
  presenterName,
  action
}: {
  sessionId: string;
  session: BookingSessionView | null;
  presenterName: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="surface-panel rounded-[32px] p-6 md:p-7">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
        School esports presentation report
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
        {session
          ? `${session.presentationTitle} at ${session.schoolName}`
          : "Submit your session report"}
      </h2>
      <p className="mt-2 text-sm leading-7 text-[color:var(--text-soft)]">
        Please fill out this report after every presentation. We&apos;ve pre-filled what we know —
        check it and complete the rest.
      </p>

      <form action={action} encType="multipart/form-data" className="mt-7 grid gap-5">
        <input type="hidden" name="bookingSessionId" value={sessionId} />
        <input type="hidden" name="returnTo" value="/ambassador/completed" />

        <ReportSection title="Presenter">
          <ReportField label="Presenter name *">
            <Input name="presenterName" defaultValue={presenterName} required />
          </ReportField>
        </ReportSection>

        <ReportSection title="School information">
          <div className="grid gap-4 md:grid-cols-2">
            <ReportField label="School name *">
              <Input name="schoolName" defaultValue={session?.schoolName ?? ""} required />
            </ReportField>
            <ReportField label="Total school roll size">
              <Input name="schoolRollSize" type="number" min={0} placeholder="e.g. 1200" />
            </ReportField>
            <ReportField label="Primary contact name *">
              <Input
                name="primaryContactName"
                defaultValue={session?.contactName ?? ""}
                placeholder="Who hosted you on the day?"
                required
              />
            </ReportField>
            <ReportField label="Primary contact email (for follow-up) *">
              <Input
                name="primaryContactEmail"
                type="email"
                defaultValue={session?.contactEmail ?? ""}
                required
              />
            </ReportField>
          </div>
          <ReportField label="Region / location">
            <Input
              name="regionLocation"
              defaultValue={[session?.regionName, session?.schoolAddress]
                .filter(Boolean)
                .join(" · ")}
              placeholder="e.g. Hamilton — 12 Whatawhata Road"
            />
          </ReportField>
        </ReportSection>

        <ReportSection title="When was the presentation delivered? *">
          <div className="grid gap-4 sm:grid-cols-2">
            <ReportField label="Date">
              <Input
                name="deliveredDate"
                type="date"
                defaultValue={nzDateValue(session?.startsAt)}
                required
              />
            </ReportField>
            <ReportField label="Time">
              <Input
                name="deliveredTime"
                type="time"
                defaultValue={nzTimeValue(session?.startsAt)}
                required
              />
            </ReportField>
          </div>
        </ReportSection>

        <ReportSection title="About the session">
          <YesNoQuestion
            name="firstPresentation"
            question="Was this the first presentation you have delivered to this school? *"
          />
          <YesNoQuestion
            name="studentsCompeted"
            question="Did you have the students compete in an esports event? *"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <ReportField label="How many attendees were present? *" hint="An approximate number is sufficient">
              <Input name="attendeeCount" type="number" min={0} placeholder="e.g. 230" required />
            </ReportField>
            <ReportField label="What age groups were presented to? *">
              <Input
                name="ageGroups"
                defaultValue={session?.yearLevels ?? ""}
                placeholder="e.g. Years 7 to 8"
                required
              />
            </ReportField>
          </div>
          <YesNoQuestion name="parentsPresent" question="Were any parents present? *" />
        </ReportSection>

        <ReportSection title="Presentation photos / videos">
          <p className="text-sm leading-6 text-[color:var(--text-soft)]">
            Upload any photos or videos you have of the presentation, as well as the signed media
            release form. Up to 6 files, 25MB each (images, video, or PDF).
          </p>
          <input
            type="file"
            name="mediaFiles"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.mp4,.mov,.webm,.pdf"
            className="w-full rounded-[16px] border border-dashed border-[color:var(--border-soft)] bg-white px-4 py-4 text-sm text-[color:var(--navy)]"
          />
          <label className="flex items-center gap-3 rounded-[16px] border border-[color:var(--border-soft)] bg-[#f6f9fd] px-4 py-3 text-sm text-[color:var(--navy)]">
            <input type="checkbox" name="mediaConsentObtained" />
            Media consent was checked or obtained where needed.
          </label>
        </ReportSection>

        <ReportSection title="Did you capture any thoughts or quotes from attendees?">
          <ReportField label="If so, share them here">
            <Textarea
              name="attendeeQuotes"
              className="min-h-24"
              placeholder="“I didn't know esports had real jobs behind it.” — Year 12 student"
            />
          </ReportField>
          <ReportField label="Any notable student questions or themes?">
            <Textarea
              name="notableQuestions"
              className="min-h-20"
              placeholder="Careers in casting, screen-time balance, how to start a school club..."
            />
          </ReportField>
        </ReportSection>

        <ReportSection title="How did you feel the presentation went? *">
          <div className="grid gap-3">
            {RATING_ROWS.map((row) => (
              <RatingRow key={row.name} name={row.name} label={row.label} />
            ))}
          </div>
          <p className="text-xs text-[color:var(--text-soft)]">1 = poor · 5 = excellent</p>
        </ReportSection>

        <ReportSection title="Presentation feedback *">
          <ReportField label="Do you have any feedback you'd like us to consider for future presentations?">
            <Textarea
              name="presentationFeedback"
              className="min-h-28"
              placeholder="What landed well, what you'd change, and anything the team should know."
              required
            />
          </ReportField>
          <ReportField label="Additional notes (optional)">
            <Textarea name="additionalNotes" className="min-h-16" />
          </ReportField>
        </ReportSection>

        <div className="flex justify-end border-t border-[color:var(--border-soft)] pt-5">
          <Button
            type="submit"
            className="rounded-[14px] border-[#2563eb] bg-[#2563eb] px-8 text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] hover:border-[#1d4fd7] hover:bg-[#1d4fd7]"
          >
            Submit report
          </Button>
        </div>
      </form>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[color:var(--border-soft)] bg-white/92 p-5">
      <h3 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">{title}</h3>
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
      <span className="text-sm font-semibold text-[color:var(--navy)]">{label}</span>
      {hint ? <span className="-mt-1 text-xs text-[color:var(--text-soft)]">{hint}</span> : null}
      {children}
    </label>
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
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((rating) => (
          <label key={rating} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={rating}
              required
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-[42px] items-center justify-center rounded-[12px] border border-[color:var(--border-soft)] bg-[#f1f5f9] text-sm font-semibold text-[color:var(--text-soft)] transition",
                "peer-checked:border-[#2563eb] peer-checked:bg-[#5a96f5] peer-checked:text-white"
              )}
            >
              {rating}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
