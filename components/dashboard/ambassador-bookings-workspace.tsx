"use client";

import {
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus2,
  CheckCircle2,
  ClipboardCheck
} from "lucide-react";
import { useState } from "react";

import {
  AmbassadorOpenBookingsExplorer,
  type AmbassadorBookingCardMode
} from "@/components/dashboard/ambassador-open-bookings-explorer";
import { Card } from "@/components/ui/card";
import { SecondaryTabs, type SecondaryTabItem } from "@/components/ui/secondary-tabs";
import type { BookingRequestView, BookingSessionView } from "@/lib/domain/types";

export type AmbassadorBookingsTab =
  | "open"
  | "calendar"
  | "applied"
  | "upcoming"
  | "completed"
  | "sourced";

type FormAction = (formData: FormData) => void | Promise<void>;

const emptyMessages: Record<AmbassadorBookingsTab, string> = {
  open: "No open bookings match those filters.",
  calendar: "No bookings match those filters.",
  applied: "You do not have any applications in review.",
  upcoming: "You do not have any confirmed presentations yet.",
  completed: "No completed bookings have been recorded yet.",
  sourced: "You do not have any upcoming sourced bookings."
};

export function AmbassadorBookingsWorkspace({
  initialTab,
  openSessions,
  upcomingSessions,
  completedSessions,
  sourcedBookings,
  nowIso,
  applyAction,
  withdrawApplicationAction,
  requestWithdrawalAction
}: {
  initialTab: AmbassadorBookingsTab;
  openSessions: BookingSessionView[];
  upcomingSessions: BookingSessionView[];
  completedSessions: BookingSessionView[];
  sourcedBookings: BookingRequestView[];
  nowIso: string;
  applyAction: FormAction;
  withdrawApplicationAction: FormAction;
  requestWithdrawalAction: FormAction;
}) {
  const [activeTab, setActiveTab] = useState<AmbassadorBookingsTab>(initialTab);
  const appliedSessions = openSessions.filter(
    (session) => session.myApplicationStatus === "applied"
  );
  const availableSessions = openSessions.filter(
    (session) => session.myApplicationStatus !== "applied"
  );
  const now = new Date(nowIso).getTime();
  const sourcedSessions = sourcedBookings.flatMap((booking) => booking.sessions);
  const isCompletedSession = (session: BookingSessionView) =>
    new Date(session.endsAt).getTime() <= now && session.status !== "cancelled";
  const upcomingSourcedSessions = sourcedSessions.filter(
    (session) => !isCompletedSession(session) && session.status !== "cancelled"
  );
  const allCompletedSessions = Array.from(
    new Map(
      [...completedSessions, ...sourcedSessions.filter(isCompletedSession)].map((session) => [
        session.id,
        session
      ])
    ).values()
  );
  const sourcedSessionIds = new Set(upcomingSourcedSessions.map((session) => session.id));
  const upcomingSessionIds = new Set(upcomingSessions.map((session) => session.id));
  const completedSessionIds = new Set(allCompletedSessions.map((session) => session.id));
  const calendarSessions = Array.from(
    new Map(
      [
        ...openSessions,
        ...upcomingSessions,
        ...allCompletedSessions,
        ...upcomingSourcedSessions
      ].map((session) => [session.id, session])
    ).values()
  );
  const calendarModes = Object.fromEntries(
    calendarSessions.map((session) => {
      let mode: AmbassadorBookingCardMode = "open";

      if (completedSessionIds.has(session.id)) {
        mode = "completed";
      } else if (sourcedSessionIds.has(session.id)) {
        mode = "sourced";
      } else if (session.myApplicationStatus === "applied") {
        mode = "applied";
      } else if (upcomingSessionIds.has(session.id)) {
        mode = "upcoming";
      }

      return [session.id, mode];
    })
  ) as Record<string, AmbassadorBookingCardMode>;

  const tabs: Array<SecondaryTabItem<AmbassadorBookingsTab>> = [
    { value: "calendar", label: "Calendar", icon: CalendarDays, count: calendarSessions.length },
    { value: "open", label: "Open", icon: BookOpenCheck, count: availableSessions.length },
    { value: "applied", label: "Applied", icon: ClipboardCheck, count: appliedSessions.length },
    { value: "upcoming", label: "Upcoming", icon: CalendarCheck2, count: upcomingSessions.length },
    {
      value: "sourced",
      label: "Sourced",
      icon: CalendarPlus2,
      count: upcomingSourcedSessions.length,
      tone: "violet"
    },
    { value: "completed", label: "Completed", icon: CheckCircle2, count: allCompletedSessions.length }
  ];

  const sessionsByTab: Record<AmbassadorBookingsTab, BookingSessionView[]> = {
    open: availableSessions,
    calendar: calendarSessions,
    applied: appliedSessions,
    upcoming: upcomingSessions,
    completed: allCompletedSessions,
    sourced: upcomingSourcedSessions
  };
  const cardMode = activeTab === "calendar" ? "open" : activeTab;

  return (
    <Card className="overflow-hidden rounded-[28px] p-0 md:p-0">
      <div className="px-5 pt-3 md:px-6 md:pt-4">
        <SecondaryTabs
          items={tabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Ambassador booking sections"
        />
      </div>

      <AmbassadorOpenBookingsExplorer
        key={activeTab}
        mode={activeTab === "calendar" ? "calendar" : cardMode}
        sessions={sessionsByTab[activeTab]}
        bookingModes={activeTab === "calendar" ? calendarModes : undefined}
        applyAction={applyAction}
        withdrawAction={withdrawApplicationAction}
        requestWithdrawalAction={requestWithdrawalAction}
        returnTo={`/ambassador/bookings?tab=${activeTab}`}
        emptyMessage={emptyMessages[activeTab]}
      />
    </Card>
  );
}
