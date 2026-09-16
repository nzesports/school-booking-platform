"use client";

import {
  ArrowRight,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileText,
  ImageIcon,
  Presentation,
  UsersRound
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { ReportDetailsButton } from "@/components/dashboard/report-details-dialog";
import { ButtonLink } from "@/components/ui/button";
import type { BookingSessionView, ReportSummary } from "@/lib/domain/types";
import { colourWithAlpha } from "@/lib/presentation-colors";
import { formatShortDate, formatTime } from "@/lib/utils";

const REPORTS_PER_PAGE = 6;

export function AmbassadorReportsWorkspace({
  completedSessions,
  reports
}: {
  completedSessions: BookingSessionView[];
  reports: ReportSummary[];
}) {
  const outstandingSessions = useMemo(
    () => completedSessions
      .filter((session) => session.reportStatus === "not_submitted")
      .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime()),
    [completedSessions]
  );
  const submittedReports = useMemo(
    () => [...reports].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    ),
    [reports]
  );
  const mediaCount = useMemo(
    () => reports.reduce((total, report) => total + (report.media?.length ?? 0), 0),
    [reports]
  );
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(submittedReports.length / REPORTS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visibleReports = submittedReports.slice(
    (currentPage - 1) * REPORTS_PER_PAGE,
    currentPage * REPORTS_PER_PAGE
  );

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,35fr)_minmax(0,65fr)]">
        <aside className="surface-panel h-full rounded-[26px] p-4 md:p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#e8f1fd] text-[#1e4fae]">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)] md:text-3xl">Report overview</h2>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <ReportMetric icon={<FileText className="h-4 w-4" />} label="Reports due" value={outstandingSessions.length} tone="amber" />
            <ReportMetric icon={<FileCheck2 className="h-4 w-4" />} label="Submitted" value={submittedReports.length} tone="green" />
            <ReportMetric icon={<ImageIcon className="h-4 w-4" />} label="Photos and media" value={mediaCount} tone="blue" />
          </div>
        </aside>

        <div className="surface-panel h-full rounded-[26px] p-4 md:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#fff5df] text-[#9a5a00]">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)] md:text-3xl">Reports to submit</h2>
          </div>
          {outstandingSessions.length > 0 ? (
            <div className="mt-4 grid gap-2.5">
              {outstandingSessions.map((session) => (
                <OutstandingReportRow key={session.id} session={session} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[18px] border border-dashed border-[#b9e2c7] bg-[#f4fbf6] px-5 py-7 text-center">
              <FileCheck2 className="mx-auto h-6 w-6 text-[#117a2e]" aria-hidden="true" />
              <p className="mt-2 font-semibold text-[color:var(--navy)]">You’re all caught up</p>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">There are no completed sessions waiting for a report.</p>
            </div>
          )}
        </div>
      </section>

      <section className="surface-panel rounded-[28px] p-5 md:p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#eaf8ee] text-[#117a2e]">
            <FileCheck2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--green)]">Your history</p>
            <h2 className="mt-0.5 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)] md:text-3xl">Submitted reports and media</h2>
          </div>
        </div>
        {submittedReports.length > 0 ? (
          <>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleReports.map((report) => <SubmittedReportCard key={report.id} report={report} />)}
            </div>
            {pageCount > 1 ? (
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[color:var(--border-soft)] pt-4">
                <p className="text-xs text-[color:var(--text-soft)]">Page {currentPage} of {pageCount}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Previous reports page" className="flex h-9 w-9 items-center justify-center rounded-[11px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:bg-[#f6f9fd] disabled:cursor-not-allowed disabled:opacity-40">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="Next reports page" className="flex h-9 w-9 items-center justify-center rounded-[11px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:bg-[#f6f9fd] disabled:cursor-not-allowed disabled:opacity-40">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-5 rounded-[20px] border border-dashed border-[color:var(--border-soft)] bg-[#f8fafc] px-5 py-9 text-center text-sm text-[color:var(--text-soft)]">
            Your submitted reports will appear here with their session images and payment-review status.
          </div>
        )}
      </section>
    </div>
  );
}

function OutstandingReportRow({ session }: { session: BookingSessionView }) {
  const accent = session.presentationAccentColor ?? "#18A83B";

  return (
    <article className="flex flex-wrap items-center gap-3 rounded-[18px] border bg-white p-3.5" style={{ borderColor: colourWithAlpha(accent, 0.3) }}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]" style={{ backgroundColor: colourWithAlpha(accent, 0.1), color: accent }}>
          <Presentation className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-[180px] flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: accent }}>{session.presentationTitle}</p>
          <h3 className="mt-0.5 font-semibold text-[color:var(--navy)]">{session.schoolName}</h3>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[color:var(--text-soft)]">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {formatShortDate(session.startsAt, true)} · {formatTime(session.startsAt)}
          </p>
        </div>
        <ButtonLink href={`/ambassador/report/${session.id}`} className="min-h-9 shrink-0 px-3 py-1.5">
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          Submit report
        </ButtonLink>
    </article>
  );
}

function SubmittedReportCard({ report }: { report: ReportSummary }) {
  const accent = report.presentationAccentColor ?? "#18A83B";
  const images = (report.media ?? []).filter((item) => item.type.toLowerCase().includes("image"));

  return (
    <article className="flex min-h-[270px] flex-col overflow-hidden rounded-[22px] border bg-white" style={{ borderColor: colourWithAlpha(accent, 0.28) }}>
      {images[0] ? (
        <div className="relative h-28 overflow-hidden bg-[#eef3f8]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[0].url} alt={images[0].title ?? `Session media from ${report.schoolName}`} className="h-full w-full object-cover" />
          {(report.media?.length ?? 0) > 1 ? (
            <span className="absolute bottom-2 right-2 rounded-full bg-[#040f4b]/80 px-2.5 py-1 text-xs font-semibold text-white">
              +{(report.media?.length ?? 1) - 1} media
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex h-20 items-center gap-2 px-5" style={{ backgroundColor: colourWithAlpha(accent, 0.08), color: accent }}>
          <Camera className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-semibold">{report.media?.length ?? 0} media files</span>
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.13em]" style={{ color: accent }}>{report.presentationTitle}</p>
        <h3 className="mt-1.5 text-lg font-semibold text-[color:var(--navy)]">{report.schoolName}</h3>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-[color:var(--text-soft)]">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatShortDate(report.submittedAt)}</span>
          <span className="inline-flex items-center gap-1.5"><UsersRound className="h-4 w-4" />{report.attendeeCount} attendees</span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[color:var(--border-soft)] pt-4">
          <span className="rounded-full bg-[#eaf8ee] px-2.5 py-1 text-xs font-semibold text-[#117a2e]">
            {report.status === "reviewed" ? "Payment reviewed" : "Submitted"}
          </span>
          <ReportDetailsButton report={report} label="View report" className="min-h-9 rounded-[11px] px-3 py-1.5 text-xs" />
        </div>
      </div>
    </article>
  );
}

function ReportMetric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: "amber" | "green" | "blue" }) {
  const tones = {
    amber: "bg-[#fff5df] text-[#9a5a00]",
    green: "bg-[#eaf8ee] text-[#117a2e]",
    blue: "bg-[#e8f1fd] text-[#1e4fae]"
  };

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[15px] border border-[color:var(--border-soft)] bg-white px-2.5 py-2.5">
      <span className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${tones[tone]}`}>{icon}</span>
      <div>
        <p className="text-2xl font-semibold leading-none tracking-[-0.04em] text-[color:var(--navy)]">{value}</p>
        <p className="truncate text-[11px] font-medium leading-4 text-[color:var(--text-soft)]">{label}</p>
      </div>
    </div>
  );
}
