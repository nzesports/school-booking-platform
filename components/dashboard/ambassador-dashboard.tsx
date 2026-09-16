import {
  ArrowRight,
  Banknote,
  BookOpenCheck,
  CalendarCheck2,
  CircleDollarSign,
  Coins,
  Download,
  FileCheck2,
  FileText,
  FolderOpen,
  Globe2,
  GraduationCap,
  LockKeyhole,
  MapPin,
  Presentation,
  School2,
  UsersRound
} from "lucide-react";
import type { ReactNode } from "react";

import { AmbassadorOpenSessionDialog } from "@/components/dashboard/ambassador-open-session-dialog";
import { AmbassadorWithdrawDialog } from "@/components/dashboard/ambassador-withdraw-dialog";
import { ReportDetailsButton } from "@/components/dashboard/report-details-dialog";
import { SessionDetailsButton } from "@/components/dashboard/session-details-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  AmbassadorProfile,
  BookingSessionView,
  PaymentRecord,
  PresentationType,
  ReportSummary,
  TrainingModule
} from "@/lib/domain/types";
import type { ResourceRecord } from "@/lib/services/portal";
import { colourWithAlpha } from "@/lib/presentation-colors";
import { formatCurrency, formatShortDate, formatTime, formatWeekdayDate, titleCase } from "@/lib/utils";

type FormAction = (formData: FormData) => void | Promise<void>;

export function AmbassadorDashboard({
  ambassador,
  openSessions,
  upcomingSessions,
  completedSessions,
  reports,
  payments,
  trainingModules,
  resources,
  presentations,
  materialsConsentAcceptedAt,
  applyAction,
  withdrawApplicationAction,
  requestWithdrawalAction
}: {
  ambassador: AmbassadorProfile;
  openSessions: BookingSessionView[];
  upcomingSessions: BookingSessionView[];
  completedSessions: BookingSessionView[];
  reports: ReportSummary[];
  payments: PaymentRecord[];
  trainingModules: TrainingModule[];
  resources: ResourceRecord[];
  presentations: PresentationType[];
  materialsConsentAcceptedAt?: string;
  applyAction: FormAction;
  withdrawApplicationAction: FormAction;
  requestWithdrawalAction: FormAction;
}) {
  const studentsReached = reports.reduce((total, report) => total + report.attendeeCount, 0);
  const schoolsReached = new Set(
    reports.map((report) => report.schoolId ?? report.schoolName.trim().toLowerCase())
  ).size;
  const reportDueSessions = completedSessions.filter(
    (session) => session.reportStatus === "not_submitted"
  );
  const missingPaymentDetails =
    ambassador.bankAccountName &&
    /^\d{2}[- ]?\d{4}[- ]?\d{7}[- ]?\d{2,3}$/.test(ambassador.bankAccountNumber ?? "")
      ? 0
      : 1;
  const appliedCount = openSessions.filter(
    (session) => session.myApplicationStatus === "applied"
  ).length;
  const sourcingBonusCents = payments.reduce(
    (total, payment) => total + payment.sourcingBonusCents,
    0
  );

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden rounded-[30px] p-0 md:p-0">
        <div className="border-b border-[color:var(--border-soft)] bg-[linear-gradient(110deg,#f7fbff,#f4fbf6)] px-5 py-5 md:px-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-white text-[#117a2e] shadow-[0_8px_24px_rgba(4,15,75,0.07)]">
              <UsersRound className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">Your impact</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[color:var(--navy)]">Delivery at a glance</h2>
            </div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <ImpactMetric icon={<UsersRound className="h-5 w-5" />} tone="green" label="Students reached" value={studentsReached.toLocaleString("en-NZ")} detail="From submitted reports" />
          <ImpactMetric icon={<School2 className="h-5 w-5" />} tone="blue" label="Schools presented to" value={schoolsReached.toLocaleString("en-NZ")} detail="Distinct schools reported" />
          <ImpactMetric icon={<Presentation className="h-5 w-5" />} tone="violet" label="Presentations completed" value={completedSessions.length.toLocaleString("en-NZ")} detail={`${reportDueSessions.length} report${reportDueSessions.length === 1 ? "" : "s"} still due`} />
          <ImpactMetric icon={<CalendarCheck2 className="h-5 w-5" />} tone="amber" label="Upcoming" value={upcomingSessions.length.toLocaleString("en-NZ")} detail="Confirmed school sessions" />
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="overflow-hidden rounded-[30px] border-[#cce8d3] bg-[linear-gradient(125deg,#f3fbf5_0%,#ffffff_62%)] p-0 md:p-0">
          <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_minmax(270px,0.76fr)]">
            <div className="flex flex-col p-5 md:p-6">
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-white text-[#117a2e] shadow-[0_8px_24px_rgba(17,122,46,0.10)]">
                  <Coins className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
                    Earnings
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                    Delivery fees and sourcing bonuses
                  </p>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
                    Total earned
                  </p>
                  <p className="mt-1 text-4xl font-semibold tracking-[-0.055em] text-[color:var(--navy)]">
                    {formatCurrency(ambassador.estimatedEarningsCents)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href="/ambassador/reports" className="shadow-none">
                    Submit report
                    {reportDueSessions.length > 0 ? <span className="rounded-full bg-white/20 px-1.5 text-xs">{reportDueSessions.length}</span> : null}
                  </ButtonLink>
                  <ButtonLink href="/ambassador/earnings" variant="secondary" className="shadow-none">
                    View payments
                    <ArrowRight className="h-4 w-4" />
                  </ButtonLink>
                </div>
              </div>

              <EarningsYearChart payments={payments} />
            </div>

            <div className="grid gap-2.5 border-t border-[#dceee1] bg-white/75 p-4 lg:border-l lg:border-t-0">
              <EarningsBreakdownRow
                icon={<Banknote className="h-4 w-4" />}
                label="Paid to date"
                detail="Completed payments"
                value={formatCurrency(ambassador.paidPaymentsCents)}
                tone="green"
              />
              <EarningsBreakdownRow
                icon={<FileCheck2 className="h-4 w-4" />}
                label="Outstanding"
                detail="Received or approved"
                value={formatCurrency(ambassador.pendingPaymentsCents)}
                tone="amber"
              />
              <EarningsBreakdownRow
                icon={<CircleDollarSign className="h-4 w-4" />}
                label="Sourcing bonus"
                detail="Eligible sourced schools"
                value={formatCurrency(sourcingBonusCents)}
                tone="violet"
              />
            </div>
          </div>
        </Card>

        <Card className="rounded-[30px]">
          <SectionHeader icon={<FileCheck2 className="h-5 w-5" />} iconClassName="bg-[#fff5df] text-[#9a5a00]" kicker="Action centre" title="Needs attention" />
          <div className="mt-5 grid gap-2.5">
            <AttentionRow icon={<FileText className="h-4 w-4" />} label="Reports due" value={reportDueSessions.length} href="/ambassador/reports" />
            <AttentionRow icon={<Banknote className="h-4 w-4" />} label="Payment details missing" value={missingPaymentDetails} href="/ambassador/profile" />
            <AttentionRow icon={<BookOpenCheck className="h-4 w-4" />} label="Applications in review" value={appliedCount} href="/ambassador/bookings?tab=applied" />
          </div>
        </Card>
      </section>

      <Card className="rounded-[30px]">
        <SectionHeader icon={<BookOpenCheck className="h-5 w-5" />} iconClassName="bg-[#e8f1fd] text-[#1e4fae]" kicker="Available bookings" title="Choose your next school presentation" actionHref="/ambassador/bookings" actionLabel="View all bookings" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {openSessions.slice(0, 3).map((session) => <OpportunityCard key={session.id} session={session} applyAction={applyAction} withdrawApplicationAction={withdrawApplicationAction} />)}
          {openSessions.length === 0 ? <EmptyPreview copy="No open opportunities currently match your profile." /> : null}
        </div>
      </Card>

      <Card className="rounded-[30px]">
        <SectionHeader icon={<CalendarCheck2 className="h-5 w-5" />} iconClassName="bg-[#e6f6eb] text-[#117a2e]" kicker="Confirmed schedule" title="Your next presentations" actionHref="/ambassador/bookings?tab=upcoming" actionLabel="View schedule" />
        <div className="mt-5 grid gap-3">
          {upcomingSessions.slice(0, 3).map((session) => <ScheduleRow key={session.id} session={session} requestWithdrawalAction={requestWithdrawalAction} />)}
          {upcomingSessions.length === 0 ? <EmptyPreview copy="You do not have a confirmed presentation yet." /> : null}
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-[30px]">
          <SectionHeader icon={<GraduationCap className="h-5 w-5" />} iconClassName="bg-[#f1edfd] text-[#6941c6]" kicker="Internal learning" title="Training library" actionHref="/ambassador/training" actionLabel="Browse training" />
          <div className="mt-5 grid gap-2.5">
            {trainingModules.slice(0, 3).map((module) => (
              <div key={module.id} className="flex items-center gap-3 rounded-[16px] border border-[color:var(--border-soft)] bg-white px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#f1edfd] text-[#6941c6]">
                  <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[color:var(--navy)]">{module.title}</span>
                  <span className="mt-0.5 block text-xs text-[color:var(--text-soft)]">
                    {module.lessons.length} {module.lessons.length === 1 ? "resource" : "resources"}
                  </span>
                </span>
              </div>
            ))}
            {trainingModules.length === 0 ? <EmptyPreview copy="Training resources will appear here when the team publishes them." /> : null}
          </div>
        </Card>

        <Card className="rounded-[30px]">
          <SectionHeader icon={<FileCheck2 className="h-5 w-5" />} iconClassName="bg-[#e6f6eb] text-[#117a2e]" kicker="Delivery history" title="Recent reports" actionHref="/ambassador/reports" actionLabel="View all reports" />
          <div className="mt-5 grid gap-2.5">
            {reports.slice(0, 3).map((report) => (
              <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[color:var(--border-soft)] px-4 py-3">
                <div className="min-w-0"><p className="truncate font-semibold text-[color:var(--navy)]">{report.schoolName}</p><p className="mt-1 text-xs text-[color:var(--text-soft)]">{report.attendeeCount} attendees · {formatShortDate(report.submittedAt)}</p></div>
                <ReportDetailsButton report={report} label="View" className="min-h-[38px] rounded-[12px] px-3 py-1.5 text-xs" />
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card className="overflow-hidden rounded-[30px] bg-[linear-gradient(120deg,#ffffff_0%,#f7fbff_52%,#f8f5ff_100%)]">
        <SectionHeader
          icon={<FolderOpen className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
          kicker="Quick downloads"
          title="Presentation decks"
          actionHref="/ambassador/materials"
          actionLabel="View all materials"
        />
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {presentations.filter((presentation) => presentation.active).slice(0, 3).map((presentation) => {
            const resource = resources.find((item) =>
              item.presentationTypeId === presentation.id &&
              item.isActive &&
              item.isCurrent &&
              ["presentation", "slide_deck", "ppt", "pptx"].includes(item.type.toLowerCase())
            );

            return (
              <PresentationDownloadCard
                key={presentation.id}
                presentation={presentation}
                resource={resource}
                materialsConsentAccepted={Boolean(materialsConsentAcceptedAt)}
              />
            );
          })}
        </div>
        <div className="mt-3">
          <QuickLink
            icon={<GraduationCap className="h-5 w-5" />}
            title="Internal training"
            detail={`${trainingModules.length} learning modules and guides`}
            href="/ambassador/training"
            tone="violet"
          />
        </div>
      </Card>
    </div>
  );
}

function PresentationDownloadCard({
  presentation,
  resource,
  materialsConsentAccepted
}: {
  presentation: PresentationType;
  resource?: ResourceRecord;
  materialsConsentAccepted: boolean;
}) {
  const accent = presentation.accentColor ?? "#18A83B";
  const isPublic = resource?.sharingScope === "public";
  const href = resource
    ? resource.storagePath
      ? `/portal/download/${encodeURIComponent(resource.id)}?download=1`
      : resource.externalUrl ?? resource.downloadUrl ?? null
    : null;

  return (
    <article
      className="flex min-h-[190px] flex-col rounded-[20px] border bg-white p-4"
      style={{ borderColor: colourWithAlpha(accent, 0.3) }}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-[13px]"
          style={{ backgroundColor: colourWithAlpha(accent, 0.1), color: accent }}
        >
          <Presentation className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <span className={isPublic ? "inline-flex items-center gap-1 rounded-full bg-[#e8f1fd] px-2.5 py-1 text-xs font-semibold text-[#1e4fae]" : "inline-flex items-center gap-1 rounded-full bg-[#f1edfd] px-2.5 py-1 text-xs font-semibold text-[#6941c6]"}>
          {isPublic ? <Globe2 className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />}
          {isPublic ? "Public" : "Internal"}
        </span>
      </div>
      <h3 className="mt-3 font-semibold leading-6 text-[color:var(--navy)]">{presentation.title}</h3>
      <p className="mt-1 text-xs leading-5 text-[color:var(--text-soft)]">
        {isPublic ? "Approved for external sharing." : "NZ Esports property — do not redistribute."}
      </p>
      <div className="mt-auto pt-4">
        {href ? (
          <ButtonLink
            href={materialsConsentAccepted ? href : "/ambassador/materials"}
            className="w-full rounded-[12px] shadow-none"
          >
            {materialsConsentAccepted ? <Download className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
            {materialsConsentAccepted ? "Download presentation" : "Review agreement"}
          </ButtonLink>
        ) : (
          <span className="inline-flex min-h-[42px] w-full items-center justify-center rounded-[12px] border border-[color:var(--border-soft)] bg-[#f6f8fb] px-4 text-sm font-semibold text-[color:var(--text-soft)]" aria-disabled="true">
            Presentation not uploaded
          </span>
        )}
      </div>
    </article>
  );
}

function ImpactMetric({ icon, tone, label, value, detail }: { icon: ReactNode; tone: "green" | "blue" | "violet" | "amber"; label: string; value: string; detail: string }) {
  const tones = { green: "bg-[#e6f6eb] text-[#117a2e]", blue: "bg-[#e8f1fd] text-[#1e4fae]", violet: "bg-[#f1edfd] text-[#6941c6]", amber: "bg-[#fff5df] text-[#9a5a00]" };
  return <div className="flex gap-4 border-b border-[color:var(--border-soft)] p-5 last:border-b-0 sm:even:border-l xl:border-b-0 xl:border-l xl:first:border-l-0 md:p-6"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${tones[tone]}`}>{icon}</span><div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-[color:var(--text-soft)]">{label}</p><p className="mt-1 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">{value}</p><p className="mt-1 text-xs text-[color:var(--text-soft)]">{detail}</p></div></div>;
}

function EarningsBreakdownRow({
  icon,
  label,
  detail,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  value: string;
  tone: "green" | "amber" | "violet";
}) {
  const iconClassName = {
    green: "bg-[#eaf8ee] text-[#117a2e]",
    amber: "bg-[#fff5df] text-[#9a5a00]",
    violet: "bg-[#f1edfd] text-[#6941c6]"
  }[tone];

  return (
    <div className="flex items-center justify-between gap-3 rounded-[17px] border border-[color:var(--border-soft)] bg-white px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${iconClassName}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[color:var(--navy)]">{label}</p>
          <p className="mt-0.5 truncate text-xs text-[color:var(--text-soft)]">{detail}</p>
        </div>
      </div>
      <p className="shrink-0 text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {value}
      </p>
    </div>
  );
}

export function EarningsYearChart({ payments }: { payments: PaymentRecord[] }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const months = Array.from({ length: 11 }, (_, index) => {
    const date = new Date(currentYear, index + 1, 1);
    const month = date.getMonth();
    const amountCents = payments.reduce((total, payment) => {
      const paymentDate = new Date(payment.createdAt);
      return paymentDate.getFullYear() === currentYear && paymentDate.getMonth() === month
        ? total + payment.amountCents
        : total;
    }, 0);

    return {
      key: `${currentYear}-${month}`,
      label: new Intl.DateTimeFormat("en-NZ", { month: "short" }).format(date),
      year: currentYear,
      amountCents
    };
  });
  const maxAmount = Math.max(...months.map((month) => month.amountCents), 1);
  const rangeTotal = months.reduce((total, month) => total + month.amountCents, 0);

  return (
    <div className="mt-7 rounded-[18px] border border-[#dceee1] bg-white/80 px-4 pb-3 pt-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]">
          Year-to-date earnings
        </p>
        <p className="text-xs text-[color:var(--text-soft)]">Feb–Dec {currentYear} · {formatCurrency(rangeTotal)}</p>
      </div>
      <div className="mt-3 overflow-x-auto pb-1">
        <div
          className="grid h-28 min-w-[640px] grid-cols-11 gap-2 border-b border-[#dceee1]"
          role="img"
          aria-label={`Monthly earnings from February to December ${currentYear}, totalling ${formatCurrency(rangeTotal)}`}
        >
          {months.map((month, index) => {
            const height = month.amountCents > 0
              ? Math.max(10, Math.round((month.amountCents / maxAmount) * 100))
              : 2;

            return (
              <div key={month.key} className="group grid min-w-0 grid-rows-[24px_1fr_20px] text-center" title={`${month.label} ${month.year}: ${formatCurrency(month.amountCents)}`}>
                <span className="truncate text-[10px] font-semibold text-[color:var(--navy)]">
                  {formatCurrency(month.amountCents)}
                </span>
                <span className="flex items-end justify-center">
                  <span
                    className="w-full max-w-8 rounded-t-[5px] bg-[linear-gradient(180deg,#45c566,#18a83b)] transition group-hover:bg-[#117a2e]"
                    style={{ height: `${height}%` }}
                  />
                </span>
                <span className="pt-1 text-[10px] text-[color:var(--text-soft)]">
                  {month.label}{index === 0 ? ` ’${String(month.year).slice(-2)}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, iconClassName, kicker, title, actionHref, actionLabel }: { icon: ReactNode; iconClassName: string; kicker: string; title: string; actionHref?: string; actionLabel?: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3.5"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] ${iconClassName}`}>{icon}</span><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">{kicker}</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[color:var(--navy)]">{title}</h2></div></div>{actionHref && actionLabel ? <ButtonLink href={actionHref} variant="ghost" className="min-h-[40px] rounded-[13px] px-3">{actionLabel}<ArrowRight className="h-4 w-4" /></ButtonLink> : null}</div>;
}

function OpportunityCard({ session, applyAction, withdrawApplicationAction }: { session: BookingSessionView; applyAction: FormAction; withdrawApplicationAction: FormAction }) {
  const accent = session.presentationAccentColor ?? "#18A83B";
  const applied = session.myApplicationStatus === "applied";
  return <article className="flex h-full flex-col rounded-[22px] border p-5" style={{ borderColor: colourWithAlpha(accent, 0.3), backgroundColor: colourWithAlpha(accent, 0.06) }}><div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white shadow-[0_8px_20px_rgba(4,15,75,0.08)]" style={{ color: accent }}><Presentation className="h-[18px] w-[18px]" /></span><StatusBadge value={applied ? "applied" : "tentative"} label={applied ? "Applied" : "Open"} /></div><p className="mt-5 text-xs font-semibold uppercase tracking-[0.13em]" style={{ color: accent }}>{session.presentationTitle}</p><h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">{session.schoolName}</h3><div className="mt-4 grid gap-2 text-sm text-[color:var(--text-soft)]"><span className="inline-flex items-center gap-2"><CalendarCheck2 className="h-4 w-4" style={{ color: accent }} />{formatWeekdayDate(session.startsAt, true)} · {formatTime(session.startsAt)}</span><span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" style={{ color: accent }} />{session.regionName ?? titleCase(session.regionSlug)}</span><span className="inline-flex items-center gap-2"><UsersRound className="h-4 w-4" style={{ color: accent }} />{session.expectedStudentCount} students · {session.yearLevels}</span></div><AmbassadorOpenSessionDialog session={session} action={applyAction} withdrawAction={withdrawApplicationAction} returnTo="/ambassador" label={applied ? "Review application" : "View and apply"} className="mt-5 w-full border-transparent bg-white text-[#1e4fae] shadow-[0_8px_22px_rgba(4,15,75,0.08)]" /></article>;
}

function ScheduleRow({ session, requestWithdrawalAction }: { session: BookingSessionView; requestWithdrawalAction: FormAction }) {
  return <div className="grid items-center gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-white p-3.5 sm:grid-cols-[54px_minmax(0,1fr)_auto]"><div className="flex h-[54px] w-[54px] flex-col items-center justify-center rounded-[14px] bg-[#eaf8ee] text-center"><span className="text-[10px] font-semibold uppercase text-[#117a2e]">{new Intl.DateTimeFormat("en-NZ", { month: "short", timeZone: "Pacific/Auckland" }).format(new Date(session.startsAt))}</span><span className="text-xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">{new Intl.DateTimeFormat("en-NZ", { day: "numeric", timeZone: "Pacific/Auckland" }).format(new Date(session.startsAt))}</span></div><div className="min-w-0"><p className="truncate font-semibold text-[color:var(--navy)]">{session.schoolName}</p><p className="mt-1 truncate text-sm text-[color:var(--text-soft)]">{session.presentationTitle} · {formatTime(session.startsAt)}</p></div><div className="flex flex-wrap gap-2 sm:justify-end"><SessionDetailsButton session={session} /><AmbassadorWithdrawDialog session={session} action={requestWithdrawalAction} returnTo="/ambassador" /></div></div>;
}

function AttentionRow({ icon, label, value, href }: { icon: ReactNode; label: string; value: number; href: string }) {
  return <ButtonLink href={href} variant="ghost" className="min-h-[52px] justify-between rounded-[15px] border border-[color:var(--border-soft)] bg-white px-3.5 shadow-none hover:bg-[#f8fafd]"><span className="inline-flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f1f5f9] text-[color:var(--navy)]">{icon}</span>{label}</span><span className={value > 0 ? "flex h-7 min-w-7 items-center justify-center rounded-full bg-[#fff5df] px-2 text-xs font-semibold text-[#9a5a00]" : "flex h-7 min-w-7 items-center justify-center rounded-full bg-[#eaf8ee] px-2 text-xs font-semibold text-[#117a2e]"}>{value}</span></ButtonLink>;
}

function QuickLink({ icon, title, detail, href, tone }: { icon: ReactNode; title: string; detail: string; href: string; tone: "blue" | "violet" | "green" }) {
  const tones = { blue: "bg-[#e8f1fd] text-[#1e4fae]", violet: "bg-[#f1edfd] text-[#6941c6]", green: "bg-[#e6f6eb] text-[#117a2e]" };
  return (
    <ButtonLink
      href={href}
      variant="secondary"
      className="min-h-[76px] justify-start rounded-[18px] border-[color:rgba(4,15,75,0.09)] bg-white/92 p-3.5 text-left shadow-[0_10px_24px_rgba(11,24,77,0.05)] hover:bg-white"
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${tones[tone]}`}>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[color:var(--navy)]">{title}</span>
          <span className="mt-0.5 block text-xs font-normal leading-5 text-[color:var(--text-soft)]">{detail}</span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4f7fb] text-[color:var(--navy)]">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
    </ButtonLink>
  );
}

function EmptyPreview({ copy }: { copy: string }) {
  return <div className="rounded-[20px] border border-dashed border-[color:var(--border-soft)] px-5 py-10 text-center text-sm text-[color:var(--text-soft)]">{copy}</div>;
}
