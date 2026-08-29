// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  clearGuestBookingDefaults,
  getGuestBookingDefaultsSnapshot,
  parseGuestBookingDefaults,
  storeGuestBookingDefaults,
  subscribeToGuestBookingDefaults
} from "@/lib/services/guest-booking-defaults";

const defaults = {
  schoolName: "Harbour College",
  contactName: "Aroha Rangi",
  contactEmail: "aroha@example.nz",
  contactPhone: "021 123 4567",
  regionSlug: "auckland"
};

describe("guest booking defaults", () => {
  it("parses only the expected contact shape", () => {
    expect(parseGuestBookingDefaults(JSON.stringify(defaults))).toEqual(defaults);
    expect(parseGuestBookingDefaults("not-json")).toBeNull();
    expect(parseGuestBookingDefaults(JSON.stringify({ ...defaults, contactPhone: 123 }))).toBeNull();
    expect(parseGuestBookingDefaults(null)).toBeNull();
  });

  it("stores and clears defaults in session storage", () => {
    storeGuestBookingDefaults(defaults);

    expect(parseGuestBookingDefaults(getGuestBookingDefaultsSnapshot())).toEqual(defaults);

    clearGuestBookingDefaults();
    expect(getGuestBookingDefaultsSnapshot()).toBeNull();
  });

  it("notifies subscribers when the stored defaults change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToGuestBookingDefaults(listener);

    storeGuestBookingDefaults(defaults);
    clearGuestBookingDefaults();
    unsubscribe();
    storeGuestBookingDefaults(defaults);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
