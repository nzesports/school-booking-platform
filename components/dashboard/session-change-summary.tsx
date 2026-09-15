import { CalendarClock, CircleX } from "lucide-react";
import type { BookingSessionView } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/utils";

export function SessionChangeSummary({ session, compact = false }: {
  session: BookingSessionView;
  compact?: boolean;
}) {
  const history = session.rescheduleHistory || [];
  const cancelled = session.status === "cancelled";
  const declined = session.status === "declined";
  const requested = session.status === "reschedule_requested";
  if (compact && !history.length) return null;
  if (!history.length && !cancelled && !declined && !requested) return null;
  return (
    <div className={compact ? "mt-2 max-w-[16rem] space-y-2" : "mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"}>
      <div className="flex flex-wrap gap-2">
        {!compact && (cancelled || declined) ? <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800"><CircleX className="h-3.5 w-3.5" aria-hidden="true" />{cancelled ? "Cancelled" : "Declined"}</span> : null}
        {history.length ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />Rescheduled</span> : null}
        {!compact && requested ? <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-900">Reschedule requested</span> : null}
      </div>
      {compact ? (
        history[0]?.previousStartsAt ? <p className="text-xs font-normal leading-5 text-[color:var(--text-muted)]">Previously {formatDateTime(history[0].previousStartsAt)} (NZ time)</p> : null
      ) : history.length ? (
        <div className="mt-3 space-y-3">{history.map((change, index) => <div key={`${change.changedAt}-${index}`} className="text-sm leading-6">
          <p className="font-medium text-[color:var(--navy)]">{change.previousStartsAt ? `Previously scheduled for ${formatDateTime(change.previousStartsAt)} (NZ time)` : "Previous date was not recorded."}</p>
          {change.startsAt ? <p className="text-[color:var(--text-muted)]">Moved to {formatDateTime(change.startsAt)} (NZ time)</p> : null}
          <p className="text-xs text-[color:var(--text-muted)]">Changed on {formatDateTime(change.changedAt)} (NZ time)</p>
        </div>)}</div>
      ) : null}
    </div>
  );
}
