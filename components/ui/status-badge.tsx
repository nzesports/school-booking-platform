import { Badge } from "@/components/ui/badge";
import type { BookingStatus, PaymentStatus, ReportStatus } from "@/lib/domain/types";

const toneMap: Record<string, string> = {
  confirmed: "bg-[#eaf8ee] text-[#117a2e]",
  report_submitted: "bg-[#eaf4ff] text-[#145ea8]",
  submitted: "bg-[#eaf4ff] text-[#145ea8]",
  reviewed: "bg-[#ecf7f5] text-[#0f6b58]",
  tentative: "bg-[#f1f3f6] text-[#667085]",
  applied: "bg-[#f1f3f6] text-[#667085]",
  ambassador_assigned: "bg-[#eaf8ee] text-[#117a2e]",
  withdrawal_requested: "bg-[#fff3e2] text-[#a85a00]",
  cancelled: "bg-[#ffecec] text-[#b42318]",
  reschedule_requested: "bg-[#fff3e2] text-[#a85a00]",
  completed_pending_report: "bg-[#f1f3f6] text-[#667085]",
  payment_pending: "bg-[#f1f3f6] text-[#667085]",
  pending: "bg-[#f1f3f6] text-[#667085]",
  approved: "bg-[#f1edff] text-[#5d41b8]",
  paid: "bg-[#eaf8ee] text-[#117a2e]",
  eligible: "bg-[#eef7fc] text-[#2a5f84]",
  not_eligible: "bg-[#f5f7fb] text-[#5a6475]",
  not_submitted: "bg-[#f5f7fb] text-[#5a6475]",
  requested: "bg-[#f1f3f6] text-[#667085]",
  declined: "bg-[#ffecec] text-[#b42318]",
  closed: "bg-[#ecf7f5] text-[#0f6b58]",
  restricted: "bg-[#fff3e2] text-[#a85a00]",
  completed: "bg-[#eaf8ee] text-[#117a2e]"
};

type StatusValue = BookingStatus | PaymentStatus | ReportStatus | "restricted" | "completed";

const schoolPendingStatuses = new Set([
  "tentative",
  "requested",
  "applied"
]);

export function schoolBookingStatusLabel(value: string) {
  return schoolPendingStatuses.has(value) ? "Pending approval" : value.replace(/_/g, " ");
}

export function StatusBadge({ value, label }: { value: StatusValue; label?: string }) {
  return (
    <Badge className={toneMap[value] ?? "bg-[color:var(--blue-soft)] text-[color:var(--navy)]"}>
      {label ?? value.replace(/_/g, " ")}
    </Badge>
  );
}
