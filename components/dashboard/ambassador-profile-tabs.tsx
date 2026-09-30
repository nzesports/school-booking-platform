"use client";

import {
  Banknote,
  CalendarCheck,
  FileText,
  LayoutDashboard,
  School2,
  Star
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SecondaryTabs, type SecondaryTabItem } from "@/components/ui/secondary-tabs";

export type AmbassadorProfileTabSection =
  | "overview"
  | "presentations"
  | "reports"
  | "sourced"
  | "feedback"
  | "payments";

// Profile sections live in the URL (?section=), so the shared secondary tabs
// navigate instead of switching local state.
export function AmbassadorProfileTabs({
  profileHref,
  activeSection,
  counts
}: {
  profileHref: string;
  activeSection: AmbassadorProfileTabSection;
  counts: Record<Exclude<AmbassadorProfileTabSection, "overview">, number>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const items: Array<SecondaryTabItem<AmbassadorProfileTabSection>> = [
    { value: "overview", label: "Overview", icon: LayoutDashboard },
    { value: "presentations", label: "Presentations", icon: CalendarCheck, count: counts.presentations },
    { value: "reports", label: "Reports", icon: FileText, count: counts.reports },
    { value: "sourced", label: "Sourced schools", icon: School2, count: counts.sourced },
    { value: "feedback", label: "School feedback", icon: Star, count: counts.feedback },
    { value: "payments", label: "Payments", icon: Banknote, count: counts.payments }
  ];

  return (
    <SecondaryTabs
      ariaLabel="Ambassador profile sections"
      items={items}
      value={activeSection}
      onChange={(section) =>
        startTransition(() => router.push(`${profileHref}?section=${section}`, { scroll: false }))
      }
    />
  );
}
