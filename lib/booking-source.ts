import type { BookingRequestView } from "@/lib/domain/types";

type BookingSource = BookingRequestView["source"];

// Who brought the booking in. Ambassador self-sourced (and referred) bookings
// earn the reporting ambassador the sourced payment rate.
export const BOOKING_SOURCE_OPTIONS: Array<[BookingSource, string]> = [
  ["public", "School (website)"],
  ["staff", "NZ Esports staff"],
  ["ambassador", "Ambassador referred"],
  ["ambassador_booked", "Ambassador self-sourced"]
];

export function isAmbassadorSource(source?: string) {
  return source === "ambassador" || source === "ambassador_booked";
}

export function bookingSourceLabel(source?: string, ambassadorName?: string) {
  const label =
    BOOKING_SOURCE_OPTIONS.find(([value]) => value === source)?.[1] ?? "Not recorded";
  return isAmbassadorSource(source) && ambassadorName ? `${label} · ${ambassadorName}` : label;
}
