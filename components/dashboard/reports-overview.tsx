import {
  ClipboardCheck,
  HeartHandshake,
  School2,
  Star,
  Trophy,
  UsersRound
} from "lucide-react";
import type { ReactNode } from "react";

import type { ReportSummary } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

function average(values: number[]) {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function percentage(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function ReportsOverview({ reports }: { reports: ReportSummary[] }) {
  const totalAttendees = reports.reduce((total, report) => total + report.attendeeCount, 0);
  const ratingRows = [
    {
      label: "Attendance",
      value: average(reports.map((r) => r.attendanceRating).filter((v): v is number => Boolean(v)))
    },
    {
      label: "Student response",
      value: average(
        reports.map((r) => r.studentEngagementRating).filter((v): v is number => Boolean(v))
      )
    },
    {
      label: "Teacher response",
      value: average(
        reports.map((r) => r.teacherResponseRating).filter((v): v is number => Boolean(v))
      )
    },
    {
      label: "Presentation energy",
      value: average(
        reports.map((r) => r.presentationEnergyRating).filter((v): v is number => Boolean(v))
      )
    }
  ];
  const overallValues = ratingRows
    .map((row) => row.value)
    .filter((value): value is number => value !== null);
  const overall = average(overallValues);

  const withFirst = reports.filter((r) => r.firstPresentationToSchool !== undefined);
  const firstPct = percentage(
    withFirst.filter((r) => r.firstPresentationToSchool).length,
    withFirst.length
  );
  const withCompeted = reports.filter((r) => r.studentsCompetedInEsports !== undefined);
  const competedPct = percentage(
    withCompeted.filter((r) => r.studentsCompetedInEsports).length,
    withCompeted.length
  );
  const withParents = reports.filter((r) => r.parentsPresent !== undefined);
  const parentsPct = percentage(
    withParents.filter((r) => r.parentsPresent).length,
    withParents.length
  );

  const recentFeedback = reports
    .filter((report) => report.presentationFeedback?.trim() || report.attendeeQuotes?.trim())
    .slice(0, 3);

  return (
    <section className="surface-panel rounded-[28px] p-5 md:p-6">
      <h2 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        Across all reports
      </h2>
      <p className="mt-1 text-sm text-[color:var(--text-soft)]">
        A rolled-up view of how presentations are landing, straight from ambassador reports.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-5">
        <OverviewTile
          icon={<ClipboardCheck className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#2563eb]"
          label="Reports submitted"
          value={String(reports.length)}
        />
        <OverviewTile
          icon={<UsersRound className="h-5 w-5" />}
          iconClassName="bg-[#ece9ff] text-[#5b4fc0]"
          label="Students reached"
          value={totalAttendees.toLocaleString("en-NZ")}
        />
        <OverviewTile
          icon={<School2 className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          label="First-time schools"
          value={firstPct === null ? "—" : `${firstPct}%`}
        />
        <OverviewTile
          icon={<Trophy className="h-5 w-5" />}
          iconClassName="bg-[#fff5df] text-[#b7791f]"
          label="Ran an esports event"
          value={competedPct === null ? "—" : `${competedPct}%`}
        />
        <OverviewTile
          icon={<HeartHandshake className="h-5 w-5" />}
          iconClassName="bg-[#fde8f0] text-[#be185d]"
          label="Parents attended"
          value={parentsPct === null ? "—" : `${parentsPct}%`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
        <div className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[color:var(--navy)]">Average ratings</p>
            {overall !== null ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff5df] px-3 py-1 text-sm font-semibold text-[#b7791f]">
                <Star className="h-4 w-4 fill-[#f4b63f] text-[#f4b63f]" />
                {overall.toFixed(1)} / 5 overall
              </span>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3">
            {ratingRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_44px] items-center gap-3">
                <span className="text-sm text-[color:var(--text-soft)]">{row.label}</span>
                <div className="h-2.5 rounded-full bg-[#e6ecf5]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      (row.value ?? 0) >= 4
                        ? "bg-[linear-gradient(135deg,#18a83b,#47c96a)]"
                        : "bg-[linear-gradient(135deg,#2563eb,#60a5fa)]"
                    )}
                    style={{ width: `${((row.value ?? 0) / 5) * 100}%` }}
                  />
                </div>
                <span className="text-right text-sm font-semibold text-[color:var(--navy)]">
                  {row.value === null ? "—" : row.value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
          <p className="text-sm font-semibold text-[color:var(--navy)]">Latest feedback</p>
          <div className="mt-3 grid gap-3">
            {recentFeedback.length === 0 ? (
              <p className="text-sm text-[color:var(--text-soft)]">
                Feedback from ambassador reports will appear here.
              </p>
            ) : null}
            {recentFeedback.map((report) => (
              <blockquote
                key={report.id}
                className="rounded-[16px] bg-[#f6f9fd] px-4 py-3 text-sm leading-6 text-[color:var(--navy)]"
              >
                “{(report.presentationFeedback ?? report.attendeeQuotes ?? "").trim()}”
                <footer className="mt-1 text-xs text-[color:var(--text-soft)]">
                  {report.ambassadorName ?? "Ambassador"} · {report.schoolName} ·{" "}
                  {report.presentationTitle}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewTile({
  icon,
  iconClassName,
  label,
  value
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-4">
    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", iconClassName)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[color:var(--text-soft)]">{label}</p>
        <p className="truncate text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {value}
        </p>
      </div>
    </div>
  );
}
