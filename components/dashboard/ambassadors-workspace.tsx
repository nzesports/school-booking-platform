import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Banknote,
  HeartPulse,
  Home,
  KeyRound,
  Quote,
  Signature,
  CalendarCheck,
  CheckCircle2,
  CircleX,
  Clock3,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plane,
  Search,
  Star,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  UsersRound
} from "lucide-react";

import { AmbassadorDeleteDialog } from "@/components/dashboard/ambassador-delete-dialog";
import { AmbassadorProfileTabs } from "@/components/dashboard/ambassador-profile-tabs";
import { DataTable } from "@/components/dashboard/data-table";
import { ReportDetailsButton } from "@/components/dashboard/report-details-dialog";
import { SchoolFeedbackDetailsButton } from "@/components/dashboard/school-feedback-details-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  AmbassadorProfile,
  BookingRequestView,
  BookingSessionView,
  PaymentRecord,
  ReportSummary,
  SchoolFeedbackSummary
} from "@/lib/domain/types";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  initials,
  titleCase
} from "@/lib/utils";

export type AmbassadorListStatus = "active" | "inactive" | "pending" | "declined";
export type VolunteerDirectorySort = "asc" | "desc";
export type AmbassadorProfileSection =
  | "overview"
  | "presentations"
  | "reports"
  | "sourced"
  | "feedback"
  | "payments";

type WorkspaceProps = {
  ambassadors: AmbassadorProfile[];
  bookings: BookingRequestView[];
  reports: ReportSummary[];
  schoolReviews: SchoolFeedbackSummary[];
  payments: PaymentRecord[];
  status: AmbassadorListStatus;
  query: string;
  sort: VolunteerDirectorySort;
  basePath: string;
};

type ProfileProps = Omit<WorkspaceProps, "ambassadors" | "status" | "query" | "sort"> & {
  ambassador: AmbassadorProfile;
  activeSection: AmbassadorProfileSection;
  reviewAction: (formData: FormData) => void | Promise<void>;
  connectAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
};

const deliveredStatuses = new Set(["completed_pending_report", "closed"]);
const outstandingPaymentStatuses = new Set(["pending", "approved"]);

const listStatuses: Array<{
  value: AmbassadorListStatus;
  label: string;
  info: string;
  empty: string;
  icon: LucideIcon;
  iconClassName: string;
  activeClassName: string;
}> = [
  {
    value: "active",
    label: "Active",
    info: "Approved ambassadors who can be assigned to sessions and use the ambassador portal.",
    empty: "No active ambassadors yet.",
    icon: UserRoundCheck,
    iconClassName: "bg-[#eaf8ee] text-[#117a2e]",
    activeClassName: "border-[#9fd9b0] bg-[#f4fbf6] shadow-[0_14px_32px_rgba(24,168,59,0.12)]"
  },
  {
    value: "inactive",
    label: "Inactive",
    info: "Restricted ambassadors. Their portal access is closed, but all presentation, feedback, sourcing and payment history is kept.",
    empty: "No inactive ambassadors.",
    icon: UserRoundX,
    iconClassName: "bg-[#fff3e2] text-[#a85a00]",
    activeClassName: "border-[#f2cf98] bg-[#fffaf2] shadow-[0_14px_32px_rgba(168,90,0,0.1)]"
  },
  {
    value: "pending",
    label: "Pending applications",
    info: "New ambassador applications waiting for staff to approve or decline.",
    empty: "No applications are waiting for review.",
    icon: Clock3,
    iconClassName: "bg-[#e8f1fd] text-[#1e4fae]",
    activeClassName: "border-[#b7d0f7] bg-[#f4f8ff] shadow-[0_14px_32px_rgba(30,79,174,0.12)]"
  },
  {
    value: "declined",
    label: "Declined",
    info: "Applications that were declined. Open one to reconsider it or delete it permanently.",
    empty: "No declined applications.",
    icon: CircleX,
    iconClassName: "bg-[#ffecec] text-[#b42318]",
    activeClassName: "border-[#f5c2c0] bg-[#fff7f7] shadow-[0_14px_32px_rgba(180,35,24,0.08)]"
  }
];

export function ambassadorListStatusFor(ambassador: AmbassadorProfile): AmbassadorListStatus {
  return ambassador.status === "approved"
    ? "active"
    : ambassador.status === "inactive"
      ? "inactive"
      : ambassador.status === "declined"
        ? "declined"
        : "pending";
}

// Accepts the current ?status= plus the older ?tab=/?roster= (staff) and
// ?view= (admin) links so existing bookmarks and notifications still land on
// the right list.
export function readAmbassadorListStatus(params: {
  status?: string;
  tab?: string;
  roster?: string;
  view?: string;
}): AmbassadorListStatus {
  if (params.status && listStatuses.some((item) => item.value === params.status)) {
    return params.status as AmbassadorListStatus;
  }

  if (params.tab === "applications" || params.view === "pending") {
    return "pending";
  }

  return params.roster === "inactive" ? "inactive" : "active";
}

export function AmbassadorsWorkspace({
  ambassadors,
  bookings,
  reports,
  schoolReviews,
  status,
  query,
  sort,
  basePath
}: WorkspaceProps) {
  const groups: Record<AmbassadorListStatus, AmbassadorProfile[]> = {
    active: [],
    inactive: [],
    pending: [],
    declined: []
  };

  for (const ambassador of ambassadors) {
    groups[ambassadorListStatusFor(ambassador)].push(ambassador);
  }

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLocaleLowerCase();
  const sortDirection = sort === "asc" ? 1 : -1;
  const visibleAmbassadors = groups[status]
    .filter(
      (ambassador) =>
        !normalizedQuery ||
        [
          ambassador.name,
          ambassador.email,
          ambassador.phone,
          ambassador.regionName,
          ambassador.regionSlug,
          ...ambassador.travelRegions
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
    )
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, "en", { sensitivity: "base" }) * sortDirection
    );
  const activeStatus = listStatuses.find((item) => item.value === status) ?? listStatuses[0];
  const isApplicationList = status === "pending" || status === "declined";

  const deliveredByAmbassador = new Map<string, BookingSessionView[]>();
  const reportSessionIdsByAmbassador = new Map<string, Set<string>>();
  const reviewsBySessionId = new Map<string, SchoolFeedbackSummary[]>();
  const sourcedSchoolsByAmbassador = new Map<string, Set<string>>();

  for (const session of bookings.flatMap((booking) => booking.sessions)) {
    if (session.assignedAmbassadorId && deliveredStatuses.has(session.status)) {
      deliveredByAmbassador.set(session.assignedAmbassadorId, [
        ...(deliveredByAmbassador.get(session.assignedAmbassadorId) ?? []),
        session
      ]);
    }
  }

  for (const report of reports) {
    if (report.ambassadorProfileId && report.bookingSessionId) {
      const sessionIds = reportSessionIdsByAmbassador.get(report.ambassadorProfileId) ?? new Set();
      sessionIds.add(report.bookingSessionId);
      reportSessionIdsByAmbassador.set(report.ambassadorProfileId, sessionIds);
    }
  }

  for (const review of schoolReviews) {
    if (review.bookingSessionId) {
      reviewsBySessionId.set(review.bookingSessionId, [
        ...(reviewsBySessionId.get(review.bookingSessionId) ?? []),
        review
      ]);
    }
  }

  for (const booking of bookings) {
    if (booking.sourcedByAmbassadorId) {
      const schoolNames =
        sourcedSchoolsByAmbassador.get(booking.sourcedByAmbassadorId) ?? new Set<string>();
      schoolNames.add(booking.schoolName);
      sourcedSchoolsByAmbassador.set(booking.sourcedByAmbassadorId, schoolNames);
    }
  }

  const listHref = (nextStatus: AmbassadorListStatus, nextSort = sort, withQuery = true) => {
    const params = new URLSearchParams({ status: nextStatus, sort: nextSort });

    if (withQuery && trimmedQuery) {
      params.set("q", trimmedQuery);
    }

    return `${basePath}?${params.toString()}`;
  };

  return (
    <div className="grid gap-5">
      <nav aria-label="Ambassador status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {listStatuses.map((item) => {
          const Icon = item.icon;
          const active = item.value === status;
          const count = groups[item.value].length;
          const needsAttention = item.value === "pending" && count > 0;

          return (
            <div
              key={item.value}
              className={cn(
                "relative flex items-center gap-4 rounded-[22px] border p-4 transition",
                "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-[rgba(24,168,59,0.45)]",
                active
                  ? item.activeClassName
                  : "border-[color:var(--border-soft)] bg-white/92 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(11,24,77,0.08)]"
              )}
            >
              <span
                className={cn(
                  "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]",
                  item.iconClassName
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {needsAttention ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[#f4b63f] ring-2 ring-white"
                  />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                  <Link
                    href={listHref(item.value, sort, false)}
                    aria-current={active ? "page" : undefined}
                    aria-label={`${item.label}: ${count}${needsAttention ? ", awaiting review" : ""}`}
                    className="after:absolute after:inset-0 after:rounded-[22px] after:content-[''] focus-visible:outline-none"
                  >
                    {item.label}
                  </Link>
                  <span className="relative z-10">
                    <InfoTooltip label={item.label}>{item.info}</InfoTooltip>
                  </span>
                </span>
                <span className="mt-1 block text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                  {count}
                </span>
              </span>
            </div>
          );
        })}
      </nav>

      <Card className="rounded-[24px] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <form action={basePath} method="get" className="flex min-w-[240px] flex-1 flex-wrap gap-2">
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="sort" value={sort} />
            <label className="flex min-h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border border-[color:var(--border-soft)] bg-[#f8fafc] px-4 text-sm text-[color:var(--navy)] focus-within:border-[rgba(24,168,59,0.45)] focus-within:bg-white">
              <Search className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" aria-hidden="true" />
              <span className="sr-only">Search {activeStatus.label.toLocaleLowerCase()}</span>
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search by name, email, phone or region"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
              />
            </label>
            <PendingSubmitButton
              unstyled
              type="submit"
              className="inline-flex min-h-[46px] items-center justify-center rounded-[14px] bg-[color:var(--navy)] px-5 text-sm font-semibold text-white transition hover:bg-[#0b1d6b]"
            >
              Search
            </PendingSubmitButton>
            {trimmedQuery ? (
              <ButtonLink href={listHref(status, sort, false)} variant="ghost" className="min-h-[46px] rounded-[14px]">
                Clear
              </ButtonLink>
            ) : null}
          </form>

          <div
            role="group"
            aria-label="Sort by name"
            className="inline-flex rounded-[14px] border border-[color:var(--border-soft)] bg-[#f8fafc] p-1"
          >
            {([
              ["asc", "A–Z"],
              ["desc", "Z–A"]
            ] as const).map(([value, label]) => {
              const active = value === sort;
              return (
                <Link
                  key={value}
                  href={listHref(status, value)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-[36px] items-center justify-center rounded-[10px] px-3.5 text-sm font-semibold transition",
                    active
                      ? "bg-white text-[color:var(--navy)] shadow-[0_2px_8px_rgba(11,24,77,0.08)]"
                      : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
        <p className="mt-3 text-xs text-[color:var(--text-soft)]">
          Showing {visibleAmbassadors.length} of {groups[status].length}{" "}
          {activeStatus.label.toLocaleLowerCase()}
          {trimmedQuery ? ` matching “${trimmedQuery}”` : ""}
        </p>
      </Card>

      {visibleAmbassadors.length === 0 ? (
        <Card className="flex flex-col items-center rounded-[24px] px-6 py-12 text-center">
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full",
              activeStatus.iconClassName
            )}
          >
            <activeStatus.icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-4 text-base font-semibold text-[color:var(--navy)]">
            {trimmedQuery ? `No matches for “${trimmedQuery}”` : activeStatus.empty}
          </p>
          {trimmedQuery ? (
            <ButtonLink href={listHref(status, sort, false)} variant="ghost" className="mt-4 rounded-[14px]">
              Clear search
            </ButtonLink>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visibleAmbassadors.map((ambassador) => {
            if (isApplicationList) {
              return (
                <ApplicationCard
                  key={ambassador.id}
                  ambassador={ambassador}
                  href={`${basePath}/${ambassador.id}`}
                />
              );
            }

            const delivered = deliveredByAmbassador.get(ambassador.id) ?? [];
            const deliveredSessionIds = new Set(delivered.map((session) => session.id));
            const submittedReports = [...(reportSessionIdsByAmbassador.get(ambassador.id) ?? [])]
              .filter((sessionId) => deliveredSessionIds.has(sessionId)).length;
            const ratings = delivered
              .flatMap((session) => reviewsBySessionId.get(session.id) ?? [])
              .map((review) => review.rating)
              .filter((rating): rating is number => typeof rating === "number");
            const schoolRating = average(ratings);

            return (
              <RosterCard
                key={ambassador.id}
                ambassador={ambassador}
                href={`${basePath}/${ambassador.id}`}
                delivered={delivered.length}
                sourced={(sourcedSchoolsByAmbassador.get(ambassador.id) ?? new Set()).size}
                rating={schoolRating}
                reviewCount={ratings.length}
                health={volunteerHealth(
                  schoolRating,
                  delivered.length > 0 ? submittedReports / delivered.length : null
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function RosterCard({
  ambassador,
  href,
  delivered,
  sourced,
  rating,
  reviewCount,
  health
}: {
  ambassador: AmbassadorProfile;
  href: string;
  delivered: number;
  sourced: number;
  rating: number | null;
  reviewCount: number;
  health: VolunteerHealth;
}) {
  const inactive = ambassador.status === "inactive";

  return (
    <article
      className={cn(
        "flex flex-col rounded-[24px] border border-[color:var(--border-soft)] p-5 shadow-[0_12px_30px_rgba(11,24,77,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(11,24,77,0.09)]",
        inactive ? "bg-[#fbfbfc]" : "bg-white"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(inactive && "opacity-70 grayscale")}>
          <AmbassadorAvatar ambassador={ambassador} size="small" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[color:var(--navy)]">{ambassador.name}</h3>
          <p className="truncate text-xs text-[color:var(--text-soft)]">
            {ambassador.email || "No email on file"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            inactive ? "bg-[#fff3e2] text-[#a85a00]" : "bg-[#eaf8ee] text-[#117a2e]"
          )}
        >
          {inactive ? "Inactive" : "Active"}
        </span>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-sm text-[color:var(--text-soft)]">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {ambassador.regionName ?? titleCase(ambassador.regionSlug)}
          {ambassador.openToTravel ? " · Open to travel" : ""}
        </span>
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-[16px] bg-[#f6f8fb] p-3 text-center">
        <RosterStat label="Delivered" value={String(delivered)} />
        <RosterStat label="Sourced" value={String(sourced)} />
        <RosterStat
          label={reviewCount === 1 ? "1 review" : `${reviewCount} reviews`}
          value={rating === null ? "—" : rating.toFixed(1)}
          icon={rating === null ? undefined : <Star className="h-3.5 w-3.5 fill-[#f4b63f] text-[#f4b63f]" aria-hidden="true" />}
        />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <HealthBadge health={health} />
        {ambassador.pendingPaymentsCents > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff3e2] px-3 py-1.5 text-xs font-semibold text-[#a85a00]">
            <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
            {formatCurrency(ambassador.pendingPaymentsCents)} pending payout
          </span>
        ) : null}
      </div>

      <div className="mt-auto pt-5">
        <ButtonLink href={href} variant="secondary" className="w-full rounded-[14px]">
          View profile
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </div>
    </article>
  );
}

function RosterStat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-center justify-center gap-1 text-lg font-semibold text-[color:var(--navy)]">
        {icon}
        {value}
      </dd>
      <dd aria-hidden="true" className="truncate text-[11px] text-[color:var(--text-soft)]">
        {label}
      </dd>
    </div>
  );
}

function ApplicationCard({ ambassador, href }: { ambassador: AmbassadorProfile; href: string }) {
  const declined = ambassador.status === "declined";
  const experience = ambassador.experience?.trim() || ambassador.bio?.trim();

  return (
    <article
      className={cn(
        "flex flex-col rounded-[24px] border p-5 shadow-[0_12px_30px_rgba(11,24,77,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(11,24,77,0.09)]",
        declined ? "border-[color:var(--border-soft)] bg-[#fbfbfc]" : "border-[#d6e4fb] bg-white"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(declined && "opacity-70 grayscale")}>
          <AmbassadorAvatar ambassador={ambassador} size="small" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[color:var(--navy)]">{ambassador.name}</h3>
          <p className="truncate text-xs text-[color:var(--text-soft)]">
            {ambassador.email || "No email on file"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            declined ? "bg-[#ffecec] text-[#b42318]" : "bg-[#e8f1fd] text-[#1e4fae]"
          )}
        >
          {declined ? "Declined" : "Awaiting review"}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-sm text-[color:var(--text-dark)]">
        <ApplicationFact icon={MapPin} label="Region">
          {ambassador.regionName ?? titleCase(ambassador.regionSlug)}
        </ApplicationFact>
        <ApplicationFact icon={Plane} label="Travel">
          {travelLabel(ambassador)}
        </ApplicationFact>
        {ambassador.phone ? (
          <ApplicationFact icon={Phone} label="Phone">
            {ambassador.phone}
          </ApplicationFact>
        ) : null}
        {ambassador.referredBy ? (
          <ApplicationFact icon={UserPlus} label="Referred by">
            {ambassador.referredBy}
          </ApplicationFact>
        ) : null}
      </dl>

      {experience ? (
        <p className="mt-4 line-clamp-3 rounded-[14px] bg-[#f6f8fb] px-3.5 py-2.5 text-sm leading-6 text-[color:var(--text-soft)]">
          {experience}
        </p>
      ) : null}

      <div className="mt-auto pt-5">
        <ButtonLink
          href={href}
          variant={declined ? "secondary" : "primary"}
          className="w-full rounded-[14px]"
        >
          {declined ? "View application" : "Review application"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </div>
    </article>
  );
}

function ApplicationFact({
  icon: Icon,
  label,
  children
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <dt className="shrink-0">
        <Icon className="h-4 w-4 text-[color:var(--text-soft)]" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

export function AmbassadorProfileWorkspace({
  ambassador,
  bookings,
  reports,
  schoolReviews,
  payments,
  basePath,
  activeSection,
  reviewAction,
  connectAction,
  deleteAction
}: ProfileProps) {
  const isApplication = ambassador.status === "applied" || ambassador.status === "declined";
  const allSessions = bookings.flatMap((booking) => booking.sessions);
  const sessionsById = new Map(allSessions.map((session) => [session.id, session]));
  const deliveredSessions = allSessions
    .filter(
      (session) =>
        session.assignedAmbassadorId === ambassador.id && deliveredStatuses.has(session.status)
    )
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime());
  const ambassadorReports = reports
    .filter((report) => report.ambassadorProfileId === ambassador.id)
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime());
  const reportsBySessionId = new Map(
    ambassadorReports
      .filter((report) => report.bookingSessionId)
      .map((report) => [report.bookingSessionId as string, report])
  );
  const reviewsBySessionId = new Map(
    schoolReviews
      .filter((review) => review.bookingSessionId)
      .map((review) => [review.bookingSessionId as string, review])
  );
  const linkedSchoolReviews = deliveredSessions
    .map((session) => ({ session, review: reviewsBySessionId.get(session.id) }))
    .filter(
      (item): item is { session: BookingSessionView; review: SchoolFeedbackSummary } =>
        Boolean(item.review)
    );
  const submittedReportCount = deliveredSessions.filter(
    (session) => reportsBySessionId.has(session.id) || ["submitted", "reviewed"].includes(session.reportStatus)
  ).length;
  const averageRating = average(
    linkedSchoolReviews
      .map(({ review }) => review.rating)
      .filter((rating): rating is number => typeof rating === "number")
  );
  const ambassadorPayments = payments.filter(
    (payment) => payment.ambassadorProfileId === ambassador.id
  );
  const outstandingPayments = ambassadorPayments.filter((payment) =>
    outstandingPaymentStatuses.has(payment.status)
  );
  const outstandingCents = outstandingPayments.reduce(
    (total, payment) => total + payment.amountCents,
    0
  );
  const sourcedBookings = bookings
    .filter((booking) => booking.sourcedByAmbassadorId === ambassador.id)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const sourcedSchoolCount = new Set(sourcedBookings.map((booking) => booking.schoolName)).size;
  const sourcingBonusCents = ambassadorPayments.reduce(
    (total, payment) => total + payment.sourcingBonusCents,
    0
  );
  const totalEarningsCents = ambassadorPayments.reduce(
    (total, payment) => total + payment.amountCents,
    0
  );
  const recordType = isApplication ? "application" : "volunteer";
  const health = volunteerHealth(
    averageRating,
    deliveredSessions.length > 0 ? submittedReportCount / deliveredSessions.length : null
  );

  const listStatus = ambassadorListStatusFor(ambassador);
  const materialsSignedAt = ambassador.details?.materialsConsentAcceptedAt;
  const recentSessions = deliveredSessions.slice(0, 4);
  const profileHref = `${basePath}/${ambassador.id}`;

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden rounded-[30px] p-0">
        <div className="bg-[linear-gradient(135deg,#f1faf4_0%,#eef5ff_58%,#f5f1ff_100%)] px-6 pb-6 pt-7 md:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-5">
              <div className={cn("shrink-0 rounded-full p-1", statusRingClassName[listStatus])}>
                <div className="rounded-full bg-white p-0.5">
                  <AmbassadorAvatar ambassador={ambassador} size="large" />
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 className="truncate text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)] md:text-[2.35rem]">
                    {ambassador.name}
                  </h2>
                  <ListStatusPill status={listStatus} />
                </div>
                <p className="mt-1 truncate text-sm text-[color:var(--text-soft)]">
                  {isApplication ? "Ambassador application" : "NZ Esports ambassador"}
                  {ambassador.email ? ` · ${ambassador.email}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <MetaChip icon={MapPin}>{ambassador.regionName ?? titleCase(ambassador.regionSlug)}</MetaChip>
                  <MetaChip icon={Plane}>{travelLabel(ambassador)}</MetaChip>
                  {!isApplication ? (
                    <>
                      <MetaChip icon={KeyRound} tone={ambassador.userId ? "good" : "warn"}>
                        {ambassador.userId ? "Portal connected" : "No portal account"}
                      </MetaChip>
                      <MetaChip icon={Signature} tone={materialsSignedAt ? "good" : "warn"}>
                        {materialsSignedAt ? "Materials agreement signed" : "Agreement not signed"}
                      </MetaChip>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {ambassador.email ? (
                <ButtonLink href={`mailto:${ambassador.email}`} variant="secondary" className="rounded-[14px]">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Email
                </ButtonLink>
              ) : null}
              {ambassador.phone ? (
                <ButtonLink href={`tel:${ambassador.phone}`} variant="secondary" className="rounded-[14px]">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Call
                </ButtonLink>
              ) : null}
            </div>
          </div>
        </div>

        {!isApplication ? (
          <dl className="grid grid-cols-2 gap-px border-t border-[color:var(--border-soft)] bg-[color:var(--border-soft)] md:grid-cols-4">
            <HeroStat
              icon={CalendarCheck}
              label="Presentations delivered"
              value={String(deliveredSessions.length)}
              detail={`${submittedReportCount}/${deliveredSessions.length} reports submitted`}
            />
            <HeroStat
              icon={Star}
              label="School rating"
              value={averageRating === null ? "—" : `${averageRating.toFixed(1)}/5`}
              detail={performanceLabel(averageRating, linkedSchoolReviews.length)}
            />
            <HeroStat
              icon={Banknote}
              label="Total earnings"
              value={formatCurrency(totalEarningsCents)}
              detail={`${formatCurrency(ambassador.paidPaymentsCents)} paid to date`}
            />
            <HeroStat
              icon={FileText}
              label="Schools sourced"
              value={String(sourcedSchoolCount)}
              detail={`${formatCurrency(sourcingBonusCents)} in sourcing bonuses`}
            />
          </dl>
        ) : null}
      </Card>

      {!isApplication ? (
        <AmbassadorProfileTabs
          profileHref={profileHref}
          activeSection={activeSection}
          counts={{
            presentations: deliveredSessions.length,
            reports: ambassadorReports.length,
            sourced: sourcedBookings.length,
            feedback: linkedSchoolReviews.length,
            payments: ambassadorPayments.length
          }}
        />
      ) : null}

      {(isApplication || activeSection === "overview") ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-5">
            {!isApplication ? (
              <HealthPanel
                health={health}
                reportsSubmitted={submittedReportCount}
                delivered={deliveredSessions.length}
                rating={averageRating}
              />
            ) : null}

            <Card className="rounded-[28px]">
              <SectionTitle
                kicker={isApplication ? "Application details" : "Contact & profile"}
                title="Information on file"
              />
              <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
                <DetailRow icon={Mail} label="Email" value={ambassador.email || "Not provided"} />
                <DetailRow icon={Phone} label="Phone" value={ambassador.phone ?? "Not provided"} />
                <DetailRow
                  icon={MapPin}
                  label="Primary region"
                  value={ambassador.regionName ?? titleCase(ambassador.regionSlug)}
                />
                <DetailRow icon={Plane} label="Travel" value={travelLabel(ambassador)} />
                <DetailRow icon={UserPlus} label="Referred by" value={ambassador.referredBy ?? "Not provided"} />
                <DetailRow
                  icon={KeyRound}
                  label="Portal account"
                  value={ambassador.userId ? "Connected" : "Not connected yet"}
                />
                <DetailRow
                  icon={Signature}
                  label="Materials agreement"
                  value={materialsSignedAt ? `Signed ${formatDateTime(materialsSignedAt)}` : "Not signed"}
                />
                {ambassador.details?.mailingAddress ? (
                  <DetailRow icon={Home} label="Mailing address" value={ambassador.details.mailingAddress} />
                ) : null}
              </dl>
              <div className="mt-6">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--text-soft)]">
                  <Quote className="h-4 w-4" aria-hidden="true" />
                  Presentation experience
                </p>
                <p className="mt-2 whitespace-pre-wrap rounded-[18px] border-l-4 border-[#9fd9b0] bg-[#f6f8fb] px-5 py-4 text-sm leading-7 text-[color:var(--text-dark)]">
                  {ambassador.experience ?? ambassador.bio ?? "No experience information was provided."}
                </p>
              </div>
            </Card>
          </div>

          <div className="grid gap-5">
            <Card className="rounded-[28px]">
              <SectionTitle
                kicker={isApplication ? "Staff decision" : "Account & record"}
                title={isApplication ? "Review this application" : "Manage volunteer"}
                info={
                  isApplication
                    ? ambassador.status === "declined"
                      ? "This application was declined. It can be reconsidered or deleted permanently."
                      : "Approve the application to add this person to the volunteer roster, or decline it to keep access closed."
                    : ambassador.userId
                      ? "Change their roster status here. Making them inactive closes portal access without removing any presentation, feedback, sourcing, or payment history."
                      : "This volunteer is not connected to a portal account yet. Their roster status can still be changed without affecting their history."
                }
              />
              <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-[#f6f8fb] px-4 py-3">
                <span className="text-sm text-[color:var(--text-soft)]">Current status</span>
                <ListStatusPill status={listStatus} />
              </div>
              <div className="mt-4 grid gap-3">
                {isApplication ? (
                  <>
                    <DecisionForm
                      action={reviewAction}
                      ambassadorId={ambassador.id}
                      status="approved"
                      returnTo={`${basePath}?status=active`}
                      label={ambassador.status === "declined" ? "Reconsider and approve" : "Approve ambassador"}
                      pendingLabel="Approving ambassador..."
                      icon={UserRoundCheck}
                    />
                    {ambassador.status === "applied" ? (
                      <DecisionForm
                        action={reviewAction}
                        ambassadorId={ambassador.id}
                        status="declined"
                        returnTo={`${basePath}?status=pending`}
                        label="Decline application"
                        pendingLabel="Declining application..."
                        icon={CircleX}
                        variant="secondary"
                      />
                    ) : null}
                  </>
                ) : ambassador.status === "approved" ? (
                  <DecisionForm
                    action={reviewAction}
                    ambassadorId={ambassador.id}
                    status="inactive"
                    returnTo={`${profileHref}?section=overview`}
                    label="Mark volunteer inactive"
                    pendingLabel="Marking volunteer inactive..."
                    icon={UserRoundX}
                    variant="secondary"
                  />
                ) : (
                  <DecisionForm
                    action={reviewAction}
                    ambassadorId={ambassador.id}
                    status="approved"
                    returnTo={`${profileHref}?section=overview`}
                    label="Activate volunteer"
                    pendingLabel="Activating volunteer..."
                    icon={UserRoundCheck}
                  />
                )}
                {!isApplication && !ambassador.userId ? (
                  <form
                    action={connectAction}
                    className="rounded-[20px] border border-[color:var(--border-soft)] bg-[#f7fafc] p-4"
                  >
                    <input type="hidden" name="ambassadorProfileId" value={ambassador.id} />
                    <input type="hidden" name="fullName" value={ambassador.name} />
                    <input type="hidden" name="returnTo" value={`${profileHref}?section=overview`} />
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f3fa] text-[color:var(--navy)]">
                        <UserPlus className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--navy)]">
                        Connect to the ambassador portal
                        <InfoTooltip label="Connect to the ambassador portal">
                          An invite will create their login and attach it to this exact profile, keeping all existing history connected.
                        </InfoTooltip>
                      </p>
                    </div>
                    <label className="mt-4 block">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                        Portal email
                      </span>
                      <input
                        type="email"
                        name="email"
                        required
                        defaultValue={ambassador.email}
                        placeholder="ambassador@example.com"
                        autoComplete="email"
                        className="mt-2 w-full rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--text-dark)] outline-none transition focus:border-[color:rgba(24,168,59,0.34)] focus:ring-4 focus:ring-[rgba(24,168,59,0.1)]"
                      />
                    </label>
                    <PendingSubmitButton
                      type="submit"
                      pendingLabel="Sending portal invite..."
                      className="mt-3 min-h-[46px] w-full rounded-[14px]"
                    >
                      Invite and connect profile
                    </PendingSubmitButton>
                  </form>
                ) : null}
              </div>
              <div className="mt-6 border-t border-[color:var(--border-soft)] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[color:var(--text-soft)]">
                  Danger zone
                </p>
                <div className="mt-2">
                  <AmbassadorDeleteDialog
                    ambassadorId={ambassador.id}
                    ambassadorName={ambassador.name}
                    recordType={recordType}
                    returnTo={`${basePath}?status=${listStatus}`}
                    action={deleteAction}
                    subtle
                  />
                </div>
              </div>
            </Card>

            {!isApplication ? (
              <Card className="rounded-[28px]">
                <div className="flex items-center justify-between gap-3">
                  <SectionTitle kicker="Latest activity" title="Recent presentations" />
                  {deliveredSessions.length > recentSessions.length ? (
                    <Link
                      href={`${profileHref}?section=presentations`}
                      className="shrink-0 text-sm font-semibold text-[#1e4fae] hover:underline"
                    >
                      View all
                    </Link>
                  ) : null}
                </div>
                {recentSessions.length === 0 ? (
                  <EmptyMessage icon={CalendarCheck}>No delivered presentations yet.</EmptyMessage>
                ) : (
                  <ul className="mt-4 grid gap-2">
                    {recentSessions.map((session) => {
                      const reportIn =
                        reportsBySessionId.has(session.id) ||
                        ["submitted", "reviewed"].includes(session.reportStatus);

                      return (
                        <li
                          key={session.id}
                          className="flex items-center gap-3 rounded-[16px] border border-[color:var(--border-soft)] px-3.5 py-3"
                        >
                          <DateBlock value={session.startsAt} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[color:var(--navy)]">
                              {session.schoolName}
                            </span>
                            <span className="block truncate text-xs text-[color:var(--text-soft)]">
                              {session.presentationTitle}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              reportIn ? "bg-[#eaf8ee] text-[#117a2e]" : "bg-[#fff3e2] text-[#a85a00]"
                            )}
                          >
                            {reportIn ? "Report in" : "Report due"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isApplication && activeSection === "presentations" ? (
        <DataTable
          title="Presentation history"
          columns={["Date", "School", "Presentation", "Ambassador report", "School feedback"]}
          emptyMessage="No completed presentations are assigned to this volunteer yet."
          rows={deliveredSessions.map((session) => {
            const report = reportsBySessionId.get(session.id);
            const reportSubmitted =
              Boolean(report) ||
              ["submitted", "reviewed"].includes(session.reportStatus);
            const review = reviewsBySessionId.get(session.id);

            return [
              formatDateTime(session.startsAt),
              session.schoolName,
              session.presentationTitle,
              report ? (
                <ReportDetailsButton
                  key={`${session.id}-report`}
                  report={report}
                  reports={ambassadorReports}
                  label="View report"
                />
              ) : (
                <StatusBadge
                  key={`${session.id}-report`}
                  value={reportSubmitted ? "submitted" : "not_submitted"}
                  label={reportSubmitted ? "Submitted" : "Missing"}
                />
              ),
              review
                ? <div key={`${session.id}-feedback`} className="flex items-center gap-2">
                    {typeof review.rating === "number" ? <span className="text-sm font-semibold text-[color:var(--navy)]">{review.rating.toFixed(1)}/5</span> : null}
                    <SchoolFeedbackDetailsButton review={review} />
                  </div>
                : "Not received"
            ];
          })}
        />
      ) : null}

      {!isApplication && activeSection === "reports" ? (
        <Card className="rounded-[28px]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionTitle
              kicker="Ambassador submissions"
              title="Reports and linked school feedback"
              info="Every submitted report stays connected to its presentation and any feedback received from the school."
            />
            {ambassadorReports.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <SummaryChip icon={FileText}>
                  {ambassadorReports.length} {ambassadorReports.length === 1 ? "report" : "reports"}
                </SummaryChip>
                <SummaryChip icon={UsersRound}>
                  {ambassadorReports
                    .reduce((total, report) => total + report.attendeeCount, 0)
                    .toLocaleString("en-NZ")}{" "}
                  students reached
                </SummaryChip>
                <SummaryChip icon={Star}>
                  {ambassadorReports.filter((report) => report.bookingSessionId && reviewsBySessionId.has(report.bookingSessionId)).length}{" "}
                  with school feedback
                </SummaryChip>
              </div>
            ) : null}
          </div>
          {ambassadorReports.length === 0 ? (
            <EmptyMessage icon={FileText}>No ambassador reports have been submitted yet.</EmptyMessage>
          ) : (
            <div className="mt-5 overflow-hidden rounded-[20px] border border-[color:var(--border-soft)]">
              <div
                aria-hidden="true"
                className={cn(
                  reportRowGridClassName,
                  "hidden items-center bg-[#f8fafc] py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)] lg:grid"
                )}
              >
                <span>Presented</span>
                <span>School</span>
                <span>Students</span>
                <span>Rating</span>
                <span>Status</span>
                <span className="text-right">View</span>
              </div>
              <ul className="divide-y divide-[color:var(--border-soft)]">
                {ambassadorReports.map((report) => {
                  const session = report.bookingSessionId ? sessionsById.get(report.bookingSessionId) : undefined;
                  const review = report.bookingSessionId ? reviewsBySessionId.get(report.bookingSessionId) : undefined;
                  const presentedAt = session?.startsAt ?? report.deliveredAt;

                  return (
                    <li
                      key={report.id}
                      className={cn(
                        reportRowGridClassName,
                        "grid items-center gap-y-2 bg-white py-3.5 text-sm transition hover:bg-[#fafcff]"
                      )}
                    >
                      <span className="text-[color:var(--text-soft)] lg:text-[color:var(--navy)]">
                        {presentedAt ? formatDate(presentedAt) : "—"}
                      </span>
                      <span className="col-span-2 min-w-0 lg:col-span-1">
                        <span className="block truncate font-semibold text-[color:var(--navy)]">{report.schoolName}</span>
                        <span className="block truncate text-xs text-[color:var(--text-soft)]">{report.presentationTitle}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[color:var(--navy)]">
                        <UsersRound className="h-3.5 w-3.5 text-[color:var(--text-soft)]" aria-hidden="true" />
                        {report.attendeeCount.toLocaleString("en-NZ")}
                        <span className="sr-only">students</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-[color:var(--navy)]">
                        {review && typeof review.rating === "number" ? (
                          <>
                            <Star className="h-3.5 w-3.5 fill-[#f5bd42] text-[#f5bd42]" aria-hidden="true" />
                            {review.rating.toFixed(1)}
                          </>
                        ) : (
                          <span className="text-[color:var(--text-soft)]">—</span>
                        )}
                      </span>
                      <span>
                        <StatusBadge value={report.status} />
                      </span>
                      <span className="col-span-2 flex flex-wrap items-center gap-1.5 lg:col-span-1 lg:justify-end">
                        <ReportDetailsButton
                          report={report}
                          reports={ambassadorReports}
                          label="Report"
                          className={compactActionClassName}
                        />
                        {review ? (
                          <SchoolFeedbackDetailsButton
                            review={review}
                            label="Feedback"
                            className={compactActionClassName}
                          />
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      ) : null}

      {!isApplication && activeSection === "sourced" ? (
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard icon={FileText} label="Schools sourced" value={String(sourcedSchoolCount)} info="Unique schools attributed to this volunteer" />
            <MetricCard icon={CalendarCheck} label="Bookings created" value={String(sourcedBookings.length)} info="Bookings with this volunteer recorded as the source" />
            <MetricCard icon={Banknote} label="Sourcing bonuses" value={formatCurrency(sourcingBonusCents)} info="Sourcing bonus tracked separately for each eligible sourced delivery" />
          </div>
          <DataTable
            title="Sourced schools and bookings"
            columns={["Created", "School", "Presentation", "Sessions", "Booking status", "Tracked bonus"]}
            emptyMessage="No schools or bookings are attributed to this volunteer yet."
            rows={sourcedBookings.map((booking) => {
              const bookingSessionIds = new Set(booking.sessions.map((session) => session.id));
              const bonus = ambassadorPayments
                .filter((payment) => bookingSessionIds.has(payment.bookingSessionId))
                .reduce((total, payment) => total + payment.sourcingBonusCents, 0);
              return [
                formatDateTime(booking.createdAt),
                booking.schoolName,
                booking.sessions[0]?.presentationTitle ?? "Presentation pending",
                String(booking.sessions.length),
                <StatusBadge key={`${booking.id}-status`} value={booking.status} />,
                bonus > 0 ? formatCurrency(bonus) : "Pending eligibility"
              ];
            })}
          />
        </div>
      ) : null}

      {!isApplication && activeSection === "feedback" ? (
        <Card className="rounded-[34px]">
          <SectionTitle kicker="Quality tracking" title="School feedback" />
          <p className="mt-2 text-sm text-[color:var(--text-soft)]">
            {performanceLabel(averageRating, linkedSchoolReviews.length)}
          </p>
          {linkedSchoolReviews.length === 0 ? (
            <EmptyMessage icon={Star}>
              No linked school feedback yet. Feedback appears here only when it belongs to a
              booking session assigned to this volunteer.
            </EmptyMessage>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {linkedSchoolReviews.map(({ session, review }) => (
                <article key={review.id} className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/92 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--navy)]">{review.schoolName}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        {session.presentationTitle} · {formatDateTime(session.startsAt)}
                      </p>
                    </div>
                    {typeof review.rating === "number" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7df] px-3 py-1.5 text-sm font-semibold text-[#7a5500]">
                        <Star className="h-4 w-4 fill-[#f5bd42] text-[#f5bd42]" aria-hidden="true" />
                        {review.rating.toFixed(1)}/5
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[color:var(--text-dark)]">“{review.quote}”</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <SchoolFeedbackDetailsButton review={review} label="View school feedback" />
                    {reportsBySessionId.get(session.id) ? (
                      <ReportDetailsButton report={reportsBySessionId.get(session.id)!} reports={ambassadorReports} label="View ambassador report" />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {!isApplication && activeSection === "payments" ? (
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard icon={CheckCircle2} label="Paid to date" value={formatCurrency(ambassador.paidPaymentsCents)} info="Payments marked paid" />
            <MetricCard icon={FileText} label="Outstanding" value={formatCurrency(outstandingCents)} detail={`${outstandingPayments.length} outstanding ${outstandingPayments.length === 1 ? "payment" : "payments"}`} />
            <MetricCard icon={Banknote} label="Sourcing bonuses" value={formatCurrency(sourcingBonusCents)} info="Additional sourcing bonuses tracked separately" />
          </div>
          <DataTable
            title="Payments and invoices"
            columns={["School", "Delivery fee", "Sourcing bonus", "Total", "Invoice", "Status"]}
            emptyMessage="No payment records exist for this volunteer yet."
            rows={ambassadorPayments.map((payment) => {
              const session = sessionsById.get(payment.bookingSessionId);
              return [
                session?.schoolName ?? "Presentation payment",
                formatCurrency(payment.baseAmountCents),
                payment.sourcingBonusCents > 0 ? formatCurrency(payment.sourcingBonusCents) : "—",
                formatCurrency(payment.amountCents),
                payment.invoiceNumber ?? "Not submitted",
                <StatusBadge key={`${payment.id}-status`} value={payment.status} />
              ];
            })}
          />
        </div>
      ) : null}
    </div>
  );
}

function AmbassadorAvatar({
  ambassador,
  size
}: {
  ambassador: AmbassadorProfile;
  size: "small" | "large";
}) {
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-full bg-[linear-gradient(135deg,#cfeaf8,#dff3e5)] text-[color:var(--navy)] shadow-[inset_0_0_0_1px_rgba(4,15,75,0.08)]",
        size === "large" ? "h-24 w-24" : "h-11 w-11"
      )}
    >
      {ambassador.imageUrl ? (
        // Profile images come from the configured Supabase public bucket, which can vary by deployment.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ambassador.imageUrl}
          alt={`${ambassador.name} profile`}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center font-semibold",
            size === "large" ? "text-2xl" : "text-sm"
          )}
          aria-label={`${ambassador.name} initials`}
        >
          {initials(ambassador.name) || "A"}
        </span>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  info
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  info?: string;
}) {
  return (
    <Card className="rounded-[28px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--text-soft)]">
            {label}
            {info ? <InfoTooltip label={label}>{info}</InfoTooltip> : null}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
            {value}
          </p>
        </div>
        <span className="rounded-[16px] bg-[#eef7fc] p-3 text-[#2a5f84]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      {detail ? <p className="mt-3 text-xs leading-5 text-[color:var(--text-soft)]">{detail}</p> : null}
    </Card>
  );
}

function SectionTitle({ kicker, title, info }: { kicker: string; title: string; info?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
        {kicker}
      </p>
      <h3 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {title}
        {info ? <InfoTooltip label={title}>{info}</InfoTooltip> : null}
      </h3>
    </div>
  );
}

const statusRingClassName: Record<AmbassadorListStatus, string> = {
  active: "bg-[linear-gradient(135deg,#34c759,#9fd9b0)]",
  inactive: "bg-[linear-gradient(135deg,#f4b63f,#f2cf98)]",
  pending: "bg-[linear-gradient(135deg,#3b82f6,#b7d0f7)]",
  declined: "bg-[linear-gradient(135deg,#e5484d,#f5c2c0)]"
};

function ListStatusPill({ status }: { status: AmbassadorListStatus }) {
  const styles: Record<AmbassadorListStatus, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-[#eaf8ee] text-[#117a2e]" },
    inactive: { label: "Inactive", className: "bg-[#fff3e2] text-[#a85a00]" },
    pending: { label: "Awaiting review", className: "bg-[#e8f1fd] text-[#1e4fae]" },
    declined: { label: "Declined", className: "bg-[#ffecec] text-[#b42318]" }
  };

  return (
    <span className={cn("inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold", styles[status].className)}>
      {styles[status].label}
    </span>
  );
}

function MetaChip({
  icon: Icon,
  tone = "neutral",
  children
}: {
  icon: LucideIcon;
  tone?: "neutral" | "good" | "warn";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        tone === "good"
          ? "border-[#bfe5cb] bg-white/80 text-[#117a2e]"
          : tone === "warn"
            ? "border-[#f2cf98] bg-white/80 text-[#a85a00]"
            : "border-[color:rgba(4,15,75,0.1)] bg-white/80 text-[color:var(--navy)]"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bg-white px-5 py-5 md:px-6">
      <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">{value}</dd>
      <dd className="mt-1 text-xs text-[color:var(--text-soft)]">{detail}</dd>
    </div>
  );
}

const healthTone: Record<VolunteerHealth["label"], { panel: string; icon: string; bar: string }> = {
  Healthy: { panel: "border-[#bfe5cb] bg-[#f4fbf6]", icon: "bg-[#dff3e5] text-[#117a2e]", bar: "bg-[#18a83b]" },
  Monitor: { panel: "border-[#f2cf98] bg-[#fffaf2]", icon: "bg-[#ffecd0] text-[#a85a00]", bar: "bg-[#f4a52b]" },
  "Needs attention": { panel: "border-[#f5c2c0] bg-[#fff7f7]", icon: "bg-[#ffe1df] text-[#b42318]", bar: "bg-[#e5484d]" },
  "No data": { panel: "border-[color:var(--border-soft)] bg-white", icon: "bg-[#eef2f8] text-[#667085]", bar: "bg-[#98a2b3]" }
};

function HealthPanel({
  health,
  reportsSubmitted,
  delivered,
  rating
}: {
  health: VolunteerHealth;
  reportsSubmitted: number;
  delivered: number;
  rating: number | null;
}) {
  const tone = healthTone[health.label];

  return (
    <Card className={cn("rounded-[28px] border", tone.panel)}>
      <div className="flex items-start gap-4">
        <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-[16px]", tone.icon)}>
          <HeartPulse className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[color:var(--text-soft)]">
            Volunteer health
          </p>
          <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[color:var(--navy)]">{health.label}</p>
          <p className="mt-1 text-sm text-[color:var(--text-soft)]">{health.detail}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ProgressMeter
          label="Reports submitted"
          display={delivered > 0 ? `${reportsSubmitted}/${delivered}` : "No sessions yet"}
          ratio={delivered > 0 ? reportsSubmitted / delivered : 0}
          barClassName={tone.bar}
        />
        <ProgressMeter
          label="School rating"
          display={rating === null ? "No reviews yet" : `${rating.toFixed(1)}/5`}
          ratio={rating === null ? 0 : rating / 5}
          barClassName={tone.bar}
        />
      </div>
    </Card>
  );
}

function ProgressMeter({
  label,
  display,
  ratio,
  barClassName
}: {
  label: string;
  display: string;
  ratio: number;
  barClassName: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-[color:var(--text-soft)]">{label}</span>
        <span className="font-semibold text-[color:var(--navy)]">{display}</span>
      </div>
      <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(4,15,75,0.06)]">
        <div
          className={cn("h-full rounded-full", barClassName)}
          style={{ width: `${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[color:var(--border-soft)] py-3.5">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#f1f5fa] text-[color:var(--text-soft)]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-[color:var(--navy)]">{value}</dd>
      </div>
    </div>
  );
}

// Reports list: one aligned row per report on wide screens, wrapping on small ones.
// Header and rows share this exactly (fixed tracks, same gap and padding) so
// every column lines up regardless of how many buttons a row has.
const reportRowGridClassName =
  "grid-cols-2 gap-x-4 px-5 lg:grid-cols-[110px_minmax(0,1fr)_90px_70px_110px_200px]";
const compactActionClassName =
  "min-h-[30px]! rounded-[10px]! px-2.5! py-1! text-xs! font-semibold! leading-4! shadow-none!";

function SummaryChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-soft)] bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)]">
      <Icon className="h-3.5 w-3.5 text-[color:var(--text-soft)]" aria-hidden="true" />
      {children}
    </span>
  );
}

// Presentation date as a compact calendar tile.
function DateBlock({ value }: { value?: string }) {
  if (!value) {
    return (
      <span className="grid h-14 w-14 place-items-center rounded-[14px] bg-[#f1f5fa] text-[10px] font-semibold uppercase text-[color:var(--text-soft)]">
        No date
      </span>
    );
  }

  // Tile pieces come from the standard "03 Jun 2026" date.
  const [day, month, year] = formatDate(value).split(" ");

  return (
    <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[14px] bg-[#eef5ff] leading-none text-[#1e4fae]">
      <span className="text-[10px] font-semibold uppercase">{month}</span>
      <span className="text-xl font-semibold">{day}</span>
      <span className="text-[10px] text-[#5b7bb8]">{year}</span>
    </span>
  );
}

function DecisionForm({
  action,
  ambassadorId,
  status,
  returnTo,
  label,
  pendingLabel,
  icon: Icon,
  variant = "primary"
}: {
  action: (formData: FormData) => void | Promise<void>;
  ambassadorId: string;
  status: "approved" | "declined" | "inactive";
  returnTo: string;
  label: string;
  pendingLabel: string;
  icon: LucideIcon;
  variant?: "primary" | "secondary";
}) {
  return (
    <form action={action}>
      <input type="hidden" name="ambassadorProfileId" value={ambassadorId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <PendingSubmitButton
        type="submit"
        pendingLabel={pendingLabel}
        variant={variant}
        className="min-h-[48px] w-full rounded-[14px]"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </PendingSubmitButton>
    </form>
  );
}

function EmptyMessage({
  icon: Icon,
  children
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="mt-5 flex gap-3 rounded-[20px] bg-[#f6f8fb] p-4 text-sm leading-6 text-[color:var(--text-soft)]">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

type VolunteerHealth = {
  label: "Healthy" | "Monitor" | "Needs attention" | "No data";
  detail: string;
};

function volunteerHealth(
  schoolRating: number | null,
  reportCompletion: number | null
): VolunteerHealth {
  if (schoolRating === null && reportCompletion === null) {
    return { label: "No data", detail: "Complete sessions will establish a health signal" };
  }

  if (
    (schoolRating !== null && schoolRating < 3.5) ||
    (reportCompletion !== null && reportCompletion < 0.75)
  ) {
    return {
      label: "Needs attention",
      detail: "Low feedback or missing ambassador reports requires follow-up"
    };
  }

  if (
    (schoolRating !== null && schoolRating < 4) ||
    (reportCompletion !== null && reportCompletion < 1)
  ) {
    return { label: "Monitor", detail: "Performance is acceptable but needs monitoring" };
  }

  return { label: "Healthy", detail: "Strong school feedback and report completion" };
}

function HealthBadge({ health }: { health: VolunteerHealth }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1.5 text-xs font-semibold",
        health.label === "Healthy"
          ? "bg-[#eaf8ee] text-[#117a2e]"
          : health.label === "Monitor"
            ? "bg-[#fff3e2] text-[#a85a00]"
            : health.label === "Needs attention"
              ? "bg-[#ffecec] text-[#b42318]"
              : "bg-[#f1f3f6] text-[#667085]"
      )}
    >
      {health.label}
    </span>
  );
}

function travelLabel(ambassador: AmbassadorProfile) {
  if (!ambassador.openToTravel) {
    return "Local region only";
  }

  return ambassador.travelRegions.length > 0
    ? ambassador.travelRegions.map(titleCase).join(", ")
    : "Open to travel";
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function performanceLabel(rating: number | null, reviewCount: number) {
  if (rating === null) {
    return "No linked school feedback yet";
  }

  const label = rating >= 4.5 ? "Excellent" : rating >= 4 ? "Strong" : rating >= 3 ? "Developing" : "Needs attention";
  return `${label} · ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`;
}
