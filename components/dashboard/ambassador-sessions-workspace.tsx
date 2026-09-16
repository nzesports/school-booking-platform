import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  FileText,
  MapPin,
  Presentation,
  School2,
  UsersRound
} from "lucide-react";
import type { ReactNode } from "react";

import { AmbassadorWithdrawDialog } from "@/components/dashboard/ambassador-withdraw-dialog";
import { SessionDetailsButton } from "@/components/dashboard/session-details-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BookingSessionView } from "@/lib/domain/types";
import { formatTime, formatWeekdayDate, titleCase } from "@/lib/utils";

type FormAction = (formData: FormData) => void | Promise<void>;

export function AmbassadorSessionsWorkspace({
  mode,
  sessions,
  withdrawalAction
}: {
  mode: "upcoming" | "completed";
  sessions: BookingSessionView[];
  withdrawalAction: FormAction;
}) {
  const completedReports = sessions.filter((session) => session.reportStatus !== "not_submitted").length;
  const reportDue = sessions.length - completedReports;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<CalendarDays className="h-5 w-5" />}
          tone="blue"
          label={mode === "upcoming" ? "Confirmed sessions" : "Completed sessions"}
          value={String(sessions.length)}
          detail={mode === "upcoming" ? "Currently assigned to you" : "Across your delivery history"}
        />
        <SummaryCard
          icon={mode === "upcoming" ? <School2 className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          tone="green"
          label={mode === "upcoming" ? "Schools coming up" : "Reports submitted"}
          value={String(mode === "upcoming" ? new Set(sessions.map((session) => session.schoolId ?? session.schoolName)).size : completedReports)}
          detail={mode === "upcoming" ? "Distinct school visits" : "Delivery records completed"}
        />
        <SummaryCard
          icon={mode === "upcoming" ? <UsersRound className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          tone={mode === "upcoming" ? "violet" : reportDue > 0 ? "amber" : "green"}
          label={mode === "upcoming" ? "Expected students" : "Reports still due"}
          value={String(mode === "upcoming" ? sessions.reduce((total, session) => total + session.expectedStudentCount, 0) : reportDue)}
          detail={mode === "upcoming" ? "Across your upcoming schedule" : "Complete these to unlock payment review"}
        />
      </section>

      <Card className="rounded-[30px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className={mode === "upcoming" ? "flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#e8f1fd] text-[#1e4fae]" : "flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#e6f6eb] text-[#117a2e]"}>
              {mode === "upcoming" ? <CalendarCheck2 className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">{mode === "upcoming" ? "Your schedule" : "Delivery history"}</p>
              <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.035em] text-[color:var(--navy)]">{mode === "upcoming" ? "Upcoming school presentations" : "Completed bookings"}</h2>
              {mode === "completed" ? <p className="mt-1 text-sm leading-6 text-[color:var(--text-soft)]">Track report and payment progress for each completed session.</p> : null}
            </div>
          </div>
          {mode === "upcoming" ? <ButtonLink href="/ambassador/bookings?tab=open" variant="ghost" className="rounded-[13px]">Find more bookings <ArrowRight className="h-4 w-4" /></ButtonLink> : null}
        </div>

        <div className="mt-6 grid gap-4">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} mode={mode} withdrawalAction={withdrawalAction} />
          ))}
          {sessions.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-[color:var(--border-soft)] px-6 py-12 text-center">
              <CalendarDays className="mx-auto h-7 w-7 text-[color:var(--text-soft)]" />
              <p className="mt-3 font-semibold text-[color:var(--navy)]">{mode === "upcoming" ? "No confirmed presentations yet" : "No completed bookings yet"}</p>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">{mode === "upcoming" ? "Apply for an open booking and it will appear here once assigned." : "Your delivered school sessions will build a clear history here."}</p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function SessionCard({ session, mode, withdrawalAction }: { session: BookingSessionView; mode: "upcoming" | "completed"; withdrawalAction: FormAction }) {
  return (
    <article className="rounded-[19px] border border-[color:var(--border-soft)] bg-white shadow-[0_8px_22px_rgba(4,15,75,0.04)]">
      <div className="grid gap-3 p-3.5 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-center md:p-4">
        <div className={mode === "upcoming" ? "flex h-14 w-14 flex-col items-center justify-center rounded-[15px] bg-[#e8f1fd]" : "flex h-14 w-14 flex-col items-center justify-center rounded-[15px] bg-[#eaf8ee]"}>
          <span className={mode === "upcoming" ? "text-xs font-semibold uppercase text-[#1e4fae]" : "text-xs font-semibold uppercase text-[#117a2e]"}>{new Intl.DateTimeFormat("en-NZ", { month: "short", timeZone: "Pacific/Auckland" }).format(new Date(session.startsAt))}</span>
          <span className="text-xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">{new Intl.DateTimeFormat("en-NZ", { day: "numeric", timeZone: "Pacific/Auckland" }).format(new Date(session.startsAt))}</span>
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="truncate font-semibold text-[color:var(--navy)]">{session.schoolName}</h3>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[#6941c6]"><Presentation className="h-3.5 w-3.5" />{session.presentationTitle}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[color:var(--text-soft)]">
            <span>{formatWeekdayDate(session.startsAt, true)} · {formatTime(session.startsAt)}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#1e4fae]" />{session.regionName ?? titleCase(session.regionSlug)}</span>
            <span className="inline-flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5 text-[#1e4fae]" />{session.actualStudentCount ?? session.expectedStudentCount} students · {session.yearLevels}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:max-w-[250px] sm:justify-end">
          <StatusBadge value={mode === "completed" ? session.reportStatus : session.status} />
          <SessionDetailsButton session={session} />
          {mode === "upcoming" ? (
            <AmbassadorWithdrawDialog session={session} action={withdrawalAction} returnTo="/ambassador/bookings?tab=upcoming" />
          ) : session.reportStatus === "not_submitted" ? (
            <ButtonLink href={`/ambassador/report/${session.id}`} className="min-h-[40px] rounded-[13px] px-3.5">Submit report <ArrowRight className="h-4 w-4" /></ButtonLink>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SummaryCard({ icon, tone, label, value, detail }: { icon: ReactNode; tone: "blue" | "green" | "violet" | "amber"; label: string; value: string; detail: string }) {
  const tones = { blue: "bg-[#e8f1fd] text-[#1e4fae]", green: "bg-[#e6f6eb] text-[#117a2e]", violet: "bg-[#f1edfd] text-[#6941c6]", amber: "bg-[#fff5df] text-[#9a5a00]" };
  return (
    <Card className="rounded-[24px] p-5 md:p-5">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">{label}</p><p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">{value}</p></div><span className={`flex h-11 w-11 items-center justify-center rounded-[14px] ${tones[tone]}`}>{icon}</span></div>
      <p className="mt-2 text-sm text-[color:var(--text-soft)]">{detail}</p>
    </Card>
  );
}
