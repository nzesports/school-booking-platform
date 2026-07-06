import { Badge } from "@/components/ui/badge";
import type { BookingStatus, PaymentStatus, ReportStatus } from "@/lib/domain/types";

const toneMap: Record<string, string> = {
  confirmed: "bg-[#eaf8ee] text-[#117a2e]",
  report_submitted: "bg-[#eaf4ff] text-[#145ea8]",
  submitted: "bg-[#eaf4ff] text-[#145ea8]",
  reviewed: "bg-[#ecf7f5] text-[#0f6b58]",
  tentative: "bg-[#fff3e2] text-[#a85a00]",
  ambassador_needed: "bg-[#fff6d7] text-[#8a6a00]",
  ambassador_applied: "bg-[#eef7fc] text-[#2a5f84]",
  ambassador_assigned: "bg-[#eef7fc] text-[#2a5f84]",
  cancelled: "bg-[#ffecec] text-[#b42318]",
  cancel_requested: "bg-[#ffecec] text-[#b42318]",
  reschedule_requested: "bg-[#fff3e2] text-[#a85a00]",
  payment_pending: "bg-[#f1edff] text-[#5d41b8]",
  pending: "bg-[#f1edff] text-[#5d41b8]",
  invoiced: "bg-[#eaf4ff] text-[#145ea8]",
  submitted_for_payment: "bg-[#f1edff] text-[#5d41b8]",
  paid: "bg-[#eaf8ee] text-[#117a2e]",
  eligible: "bg-[#eef7fc] text-[#2a5f84]",
  not_eligible: "bg-[#f5f7fb] text-[#5a6475]",
  not_submitted: "bg-[#f5f7fb] text-[#5a6475]",
  requested: "bg-[#fff3e2] text-[#a85a00]",
  declined: "bg-[#ffecec] text-[#b42318]",
  closed: "bg-[#ecf7f5] text-[#0f6b58]",
  restricted: "bg-[#fff3e2] text-[#a85a00]",
  completed: "bg-[#eaf8ee] text-[#117a2e]"
};

type StatusValue = BookingStatus | PaymentStatus | ReportStatus | "restricted" | "completed";

export function StatusBadge({ value }: { value: StatusValue }) {
  return (
    <Badge className={toneMap[value] ?? "bg-[color:var(--blue-soft)] text-[color:var(--navy)]"}>
      {value.replace(/_/g, " ")}
    </Badge>
  );
}
