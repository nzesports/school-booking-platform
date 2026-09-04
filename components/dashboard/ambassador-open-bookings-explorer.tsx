"use client";

import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek
} from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  FileText,
  MapPin,
  Presentation,
  Search,
  UsersRound
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { AmbassadorOpenSessionDialog } from "@/components/dashboard/ambassador-open-session-dialog";
import { AmbassadorWithdrawDialog } from "@/components/dashboard/ambassador-withdraw-dialog";
import { SessionDetailsButton } from "@/components/dashboard/session-details-dialog";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BookingSessionView } from "@/lib/domain/types";
import { colourWithAlpha } from "@/lib/presentation-colors";
import { cn, formatTime, formatWeekdayDate, titleCase } from "@/lib/utils";

const PAGE_SIZE = 9;

type FormAction = (formData: FormData) => void | Promise<void>;

export type AmbassadorBookingCardMode =
  | "open"
  | "applied"
  | "upcoming"
  | "completed"
  | "sourced";

type AmbassadorBookingsExplorerMode = AmbassadorBookingCardMode | "calendar";

const presentationThemes = {
  digital: {
    border: "border-[#b9e2c7]",
    icon: "bg-[#e6f6eb] text-[#117a2e]",
    wash: "from-[#f2fbf5] to-white"
  },
  understanding: {
    border: "border-[#c8dcfb]",
    icon: "bg-[#e8f1fd] text-[#1e4fae]",
    wash: "from-[#f4f8ff] to-white"
  },
  other: {
    border: "border-[#ead7af]",
    icon: "bg-[#fff5df] text-[#9a5a00]",
    wash: "from-[#fffaf0] to-white"
  },
  sourced: {
    border: "border-[#d8c8f4]",
    icon: "bg-[#f1edfd] text-[#6941c6]",
    wash: "from-[#f8f5ff] to-white"
  }
} as const;

const calendarModeThemes: Record<
  AmbassadorBookingCardMode,
  { label: string; dot: string; event: string }
> = {
  open: {
    label: "Open",
    dot: "bg-[#18a83b]",
    event: "border-[#b9e2c7] bg-[#e6f6eb] text-[#117a2e]"
  },
  applied: {
    label: "Applied",
    dot: "bg-[#d49317]",
    event: "border-[#ead7af] bg-[#fff5df] text-[#8a5700]"
  },
  upcoming: {
    label: "Upcoming",
    dot: "bg-[#2563eb]",
    event: "border-[#c8dcfb] bg-[#e8f1fd] text-[#1e4fae]"
  },
  sourced: {
    label: "Sourced",
    dot: "bg-[#7c3aed]",
    event: "border-[#d8c8f4] bg-[#f1edfd] text-[#6941c6]"
  },
  completed: {
    label: "Completed",
    dot: "bg-[#64748b]",
    event: "border-[#d7dee8] bg-[#f1f5f9] text-[#475569]"
  }
};

function presentationTheme(title: string, mode: AmbassadorBookingCardMode) {
  if (mode === "sourced") return presentationThemes.sourced;

  const normalized = title.toLowerCase();
  if (normalized.includes("digital wellbeing")) return presentationThemes.digital;
  if (normalized.includes("understanding")) return presentationThemes.understanding;
  return presentationThemes.other;
}

export function AmbassadorOpenBookingsExplorer({
  mode,
  sessions,
  bookingModes,
  applyAction,
  withdrawAction,
  requestWithdrawalAction,
  returnTo,
  emptyMessage
}: {
  mode: AmbassadorBookingsExplorerMode;
  sessions: BookingSessionView[];
  bookingModes?: Record<string, AmbassadorBookingCardMode>;
  applyAction: FormAction;
  withdrawAction: FormAction;
  requestWithdrawalAction: FormAction;
  returnTo: string;
  emptyMessage: string;
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [presentation, setPresentation] = useState("all");
  const [sort, setSort] = useState<"soonest" | "latest">("soonest");
  const [page, setPage] = useState(1);
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(new Date(sessions[0]?.startsAt ?? new Date().toISOString()))
  );

  const regionOptions = useMemo(
    () =>
      Array.from(
        new Map(
          sessions.map((session) => [
            session.regionSlug,
            session.regionName ?? titleCase(session.regionSlug)
          ])
        )
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [sessions]
  );
  const presentationOptions = useMemo(
    () => Array.from(new Set(sessions.map((session) => session.presentationTitle))).sort(),
    [sessions]
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return sessions
      .filter((session) => {
        const searchText = [
          session.schoolName,
          session.presentationTitle,
          session.regionName,
          session.regionSlug,
          session.yearLevels
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!normalized || searchText.includes(normalized)) &&
          (region === "all" || session.regionSlug === region) &&
          (presentation === "all" || session.presentationTitle === presentation)
        );
      })
      .sort((left, right) => {
        const difference =
          new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
        return sort === "soonest" ? difference : -difference;
      });
  }, [presentation, query, region, sessions, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageSessions = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const days = Array.from(
    { length: 42 },
    (_, index) => addDays(startOfWeek(viewMonth, { weekStartsOn: 1 }), index)
  );
  const resetPage = () => setPage(1);

  return (
    <section className="overflow-hidden">
      <div className="border-b border-[color:var(--border-soft)] p-5 md:p-6">
        <div
          className={cn(
            "grid gap-3",
            mode === "calendar"
              ? "xl:grid-cols-[minmax(280px,1fr)_repeat(2,minmax(170px,220px))]"
              : "xl:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(150px,210px))]"
          )}
        >
          <label className="flex min-h-[46px] items-center gap-2.5 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 text-sm text-[color:var(--navy)]">
            <Search className="h-4 w-4 text-[color:var(--text-soft)]" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
              placeholder="Search school or presentation"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[color:var(--text-soft)]"
            />
          </label>
          <FilterSelect
            ariaLabel="Filter by region"
            value={region}
            onChange={(value) => {
              setRegion(value);
              resetPage();
            }}
            options={[["all", "All locations"], ...regionOptions]}
          />
          <FilterSelect
            ariaLabel="Filter by presentation"
            value={presentation}
            onChange={(value) => {
              setPresentation(value);
              resetPage();
            }}
            options={[
              ["all", "All presentations"],
              ...presentationOptions.map((title) => [title, title] as [string, string])
            ]}
          />
          {mode !== "calendar" ? (
            <FilterSelect
              ariaLabel="Sort bookings"
              value={sort}
              onChange={(value) => {
                setSort(value as "soonest" | "latest");
                resetPage();
              }}
              options={[
                ["soonest", "Soonest first"],
                ["latest", "Latest first"]
              ]}
            />
          ) : null}
        </div>
      </div>

      {mode === "calendar" ? (
        <CalendarView
          sessions={filtered}
          days={days}
          viewMonth={viewMonth}
          bookingModes={bookingModes ?? {}}
          applyAction={applyAction}
          withdrawAction={withdrawAction}
          returnTo={returnTo}
          emptyMessage={emptyMessage}
          onPreviousMonth={() => setViewMonth((current) => addMonths(current, -1))}
          onCurrentMonth={() => setViewMonth(startOfMonth(new Date()))}
          onNextMonth={() => setViewMonth((current) => addMonths(current, 1))}
        />
      ) : (
        <div className="p-5 md:p-6">
          {pageSessions.length === 0 ? (
            <EmptyState message={emptyMessage} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pageSessions.map((session) => (
                <BookingCard
                  key={session.id}
                  session={session}
                  mode={mode}
                  applyAction={applyAction}
                  withdrawAction={withdrawAction}
                  requestWithdrawalAction={requestWithdrawalAction}
                  returnTo={returnTo}
                />
              ))}
            </div>
          )}

          {pageCount > 1 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--border-soft)] pt-5">
              <p className="text-sm text-[color:var(--text-soft)]">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <PageButton
                  label="Previous page"
                  disabled={safePage === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ArrowLeft className="h-4 w-4" />
                </PageButton>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === safePage ? "page" : undefined}
                    className={cn(
                      "flex h-10 min-w-10 items-center justify-center rounded-[12px] border px-3 text-sm font-semibold transition",
                      item === safePage
                        ? "border-[#a9d8b6] bg-[#eaf8ee] text-[#117a2e]"
                        : "border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] hover:bg-[#f6f9fd]"
                    )}
                  >
                    {item}
                  </button>
                ))}
                <PageButton
                  label="Next page"
                  disabled={safePage === pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                >
                  <ArrowRight className="h-4 w-4" />
                </PageButton>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function BookingCard({
  session,
  mode,
  applyAction,
  withdrawAction,
  requestWithdrawalAction,
  returnTo
}: {
  session: BookingSessionView;
  mode: AmbassadorBookingCardMode;
  applyAction: FormAction;
  withdrawAction: FormAction;
  requestWithdrawalAction: FormAction;
  returnTo: string;
}) {
  const theme = presentationTheme(session.presentationTitle, mode);
  const studentCount =
    mode === "completed"
      ? session.actualStudentCount ?? session.expectedStudentCount
      : session.expectedStudentCount;
  const detailIconClassName = mode === "sourced" ? "text-[#6941c6]" : "text-[#1e4fae]";
  const accent = mode === "sourced" ? "#7c3aed" : (session.presentationAccentColor ?? "#18A83B");

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-[22px] border bg-gradient-to-br p-5",
        theme.border,
        theme.wash
      )}
      style={{ borderColor: colourWithAlpha(accent, 0.3), background: `linear-gradient(135deg, ${colourWithAlpha(accent, 0.07)}, #ffffff)` }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-[14px]", theme.icon)} style={{ backgroundColor: colourWithAlpha(accent, 0.1), color: accent }}>
          <Presentation className="h-5 w-5" />
        </span>
        <BookingCardStatus session={session} mode={mode} />
      </div>
      <p
        className={cn(
          "mt-5 text-xs font-semibold uppercase tracking-[0.13em]",
          mode === "sourced" ? "text-[#6941c6]" : "text-[color:var(--text-soft)]"
        )}
        style={{ color: accent }}
      >
        {session.presentationTitle}
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {session.schoolName}
      </h3>
      <div className="mt-4 grid gap-2.5 text-sm text-[color:var(--text-soft)]">
        <span className="inline-flex items-center gap-2">
          <CalendarCheck2 className={cn("h-4 w-4", detailIconClassName)} />
          {formatWeekdayDate(session.startsAt)} · {formatTime(session.startsAt)}
        </span>
        <span className="inline-flex items-center gap-2">
          <MapPin className={cn("h-4 w-4", detailIconClassName)} />
          {session.regionName ?? titleCase(session.regionSlug)}
        </span>
        <span className="inline-flex items-center gap-2">
          <UsersRound className={cn("h-4 w-4", detailIconClassName)} />
          {studentCount} students · {session.yearLevels}
        </span>
      </div>
      <div className="mt-auto pt-6">
        <BookingCardActions
          session={session}
          mode={mode}
          applyAction={applyAction}
          withdrawAction={withdrawAction}
          requestWithdrawalAction={requestWithdrawalAction}
          returnTo={returnTo}
        />
      </div>
    </article>
  );
}

function BookingCardStatus({
  session,
  mode
}: {
  session: BookingSessionView;
  mode: AmbassadorBookingCardMode;
}) {
  if (mode === "sourced") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="rounded-full bg-[#e9ddfb] px-2.5 py-1 text-xs font-semibold text-[#6941c6]">
          Sourced
        </span>
        <StatusBadge value={session.status} />
      </div>
    );
  }

  if (mode === "completed") {
    return (
      <StatusBadge
        value={session.reportStatus}
        label={session.reportStatus === "not_submitted" ? "Report due" : "Completed"}
      />
    );
  }

  if (mode === "upcoming") {
    return (
      <StatusBadge
        value={session.status}
        label={session.status === "withdrawal_requested" ? undefined : "Upcoming"}
      />
    );
  }

  return (
    <StatusBadge
      value={mode === "applied" ? "applied" : "tentative"}
      label={mode === "applied" ? "Applied" : "Open"}
    />
  );
}

function BookingCardActions({
  session,
  mode,
  applyAction,
  withdrawAction,
  requestWithdrawalAction,
  returnTo
}: {
  session: BookingSessionView;
  mode: AmbassadorBookingCardMode;
  applyAction: FormAction;
  withdrawAction: FormAction;
  requestWithdrawalAction: FormAction;
  returnTo: string;
}) {
  const actionClassName =
    "min-h-[42px] w-full border-transparent bg-white text-[#1e4fae] shadow-[0_8px_22px_rgba(4,15,75,0.08)]";

  if (mode === "open" || mode === "applied") {
    return (
      <AmbassadorOpenSessionDialog
        session={session}
        action={applyAction}
        withdrawAction={withdrawAction}
        returnTo={returnTo}
        label={mode === "applied" ? "Review application" : "View and apply"}
        className={actionClassName}
      />
    );
  }

  if (mode === "upcoming") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <SessionDetailsButton session={session} className={actionClassName} />
        <AmbassadorWithdrawDialog
          session={session}
          action={requestWithdrawalAction}
          returnTo={returnTo}
          className="min-h-[42px] w-full rounded-[14px] bg-white px-3.5 text-xs shadow-[0_8px_22px_rgba(4,15,75,0.08)]"
        />
      </div>
    );
  }

  if (mode === "completed") {
    const reportDue = session.reportStatus === "not_submitted";

    return (
      <div className={cn("grid gap-2", reportDue && "sm:grid-cols-2")}>
        <SessionDetailsButton session={session} className={actionClassName} />
        {reportDue ? (
          <ButtonLink
            href={`/ambassador/report/${session.id}`}
            className="min-h-[42px] w-full shadow-none"
          >
            <FileText className="h-4 w-4" />
            Submit report
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  return (
    <SessionDetailsButton
      session={session}
      className={cn(
        actionClassName,
        "text-[#6941c6] shadow-[0_8px_22px_rgba(105,65,198,0.10)]"
      )}
    />
  );
}

function CalendarView({
  sessions,
  days,
  viewMonth,
  bookingModes,
  applyAction,
  withdrawAction,
  returnTo,
  emptyMessage,
  onPreviousMonth,
  onCurrentMonth,
  onNextMonth
}: {
  sessions: BookingSessionView[];
  days: Date[];
  viewMonth: Date;
  bookingModes: Record<string, AmbassadorBookingCardMode>;
  applyAction: FormAction;
  withdrawAction: FormAction;
  returnTo: string;
  emptyMessage: string;
  onPreviousMonth: () => void;
  onCurrentMonth: () => void;
  onNextMonth: () => void;
}) {
  return (
    <div className="p-5 md:p-6">
      <div className="mb-5 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-2">
          <PageButton label="Previous month" disabled={false} onClick={onPreviousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </PageButton>
          <button
            type="button"
            onClick={onCurrentMonth}
            className="min-h-10 rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm font-semibold text-[color:var(--navy)]"
          >
            Today
          </button>
          <PageButton label="Next month" disabled={false} onClick={onNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </PageButton>
        </div>
        <h3 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {format(viewMonth, "MMMM yyyy")}
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:justify-end">
          {(Object.keys(calendarModeThemes) as AmbassadorBookingCardMode[]).map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--text-soft)]"
            >
              <span className={cn("h-2 w-2 rounded-full", calendarModeThemes[item].dot)} />
              {calendarModeThemes[item].label}
            </span>
          ))}
        </div>
      </div>

      {sessions.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="max-w-full overflow-x-auto rounded-[20px] border border-[color:var(--border-soft)]">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 bg-[#f6f9fd]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div
                  key={day}
                  className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const daySessions = sessions.filter((session) =>
                  isSameDay(new Date(session.startsAt), day)
                );

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-w-0 min-h-[clamp(104px,8vw,132px)] overflow-hidden border-r border-t border-[color:var(--border-soft)] p-2 [&:nth-child(7n)]:border-r-0",
                      !isSameMonth(day, viewMonth) &&
                        "bg-[#fafbfd] text-[color:var(--text-soft)]"
                    )}
                  >
                    <span className="text-xs font-semibold">{format(day, "d")}</span>
                    <div className="mt-2 grid min-w-0 gap-1.5">
                      {daySessions.map((session) => {
                        const entryMode = bookingModes[session.id] ?? "open";
                        const label = (
                          <>
                            <span className="block min-w-0 whitespace-normal break-words">
                              {session.schoolName.replace(/^Demo\s+/i, "")}
                            </span>
                            <span className="block text-[10px] font-medium opacity-75">
                              {formatTime(session.startsAt)} · {calendarModeThemes[entryMode].label}
                            </span>
                          </>
                        );
                        const className = cn(
                          "block w-full min-w-0 max-w-full overflow-hidden rounded-[9px] border px-2 py-1.5 text-left text-[11px] font-semibold leading-4 transition hover:brightness-95",
                          calendarModeThemes[entryMode].event
                        );

                        return entryMode === "open" || entryMode === "applied" ? (
                          <AmbassadorOpenSessionDialog
                            key={session.id}
                            session={session}
                            action={applyAction}
                            withdrawAction={withdrawAction}
                            returnTo={returnTo}
                            unstyled
                            label={label}
                            className={className}
                          />
                        ) : (
                          <SessionDetailsButton
                            key={session.id}
                            session={session}
                            unstyled
                            label={label}
                            className={className}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  ariaLabel,
  value,
  onChange,
  options
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-[46px] min-w-0 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-3.5 text-sm font-medium text-[color:var(--navy)] outline-none"
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:bg-[#f6f9fd] disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-[color:var(--border-soft)] px-6 py-12 text-center text-sm text-[color:var(--text-soft)]">
      {message}
    </div>
  );
}
