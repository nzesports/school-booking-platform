import {
  Banknote,
  CalendarDays,
  Clock3,
  FileText,
  MapPinned,
  School2,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound
} from "lucide-react";

import { Card } from "@/components/ui/card";
import type { DashboardMetric } from "@/lib/domain/types";

const iconMap = {
  banknote: Banknote,
  calendar: CalendarDays,
  clock: Clock3,
  file: FileText,
  map: MapPinned,
  school: School2,
  shield: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  users: UsersRound
} as const;

const toneMap = {
  amber: "bg-[linear-gradient(90deg,#ffd9a2,#ffb141)]",
  blue: "bg-[linear-gradient(90deg,#c7e4ff,#7ab8ff)]",
  green: "bg-[linear-gradient(90deg,#92e3a9,#18a83b)]",
  navy: "bg-[linear-gradient(90deg,#5f79d8,#040f4b)]",
  violet: "bg-[linear-gradient(90deg,#d8ceff,#7864ff)]"
} as const;

export function MetricGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = iconMap[metric.icon ?? "sparkles"];
        return (
          <Card key={metric.label} className="relative overflow-hidden">
            <div className={`absolute inset-x-0 top-0 h-1 ${toneMap[metric.tone ?? "green"]}`} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[color:var(--text-muted)]">{metric.label}</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                  {metric.value}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f7fbff,#edf6ff)] text-[color:var(--green)] shadow-[inset_0_0_0_1px_rgba(4,15,75,0.06)]">
                <Icon className="h-5 w-5" />
              </div>
            </div>
            {metric.trend ? (
              <p className="mt-4 text-sm font-semibold text-[color:var(--green)]">{metric.trend}</p>
            ) : null}
            {metric.detail ? (
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">{metric.detail}</p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
