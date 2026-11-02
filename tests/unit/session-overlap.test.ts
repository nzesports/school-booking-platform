import { describe, expect, it } from "vitest";

import { findOverlappingSession, intervalsOverlap } from "@/lib/session-overlap";

const at = (time: string) => `2026-11-10T${time}:00Z`;

describe("intervalsOverlap", () => {
  it("flags any shared minute", () => {
    expect(intervalsOverlap(at("21:00"), at("22:00"), at("21:59"), at("23:00"))).toBe(true);
    expect(intervalsOverlap(at("21:00"), at("22:00"), at("21:15"), at("21:45"))).toBe(true);
    expect(intervalsOverlap(at("21:00"), at("22:00"), at("21:00"), at("22:00"))).toBe(true);
  });

  it("allows back-to-back sessions that only touch", () => {
    expect(intervalsOverlap(at("21:00"), at("22:00"), at("22:00"), at("23:00"))).toBe(false);
    expect(intervalsOverlap(at("22:00"), at("23:00"), at("21:00"), at("22:00"))).toBe(false);
  });
});

describe("findOverlappingSession", () => {
  const sessions = [
    { id: "self", status: "confirmed", starts_at: at("21:00"), ends_at: at("22:00") },
    { id: "cancelled", status: "cancelled", starts_at: at("21:00"), ends_at: at("22:00") },
    { id: "declined", status: "declined", starts_at: at("21:00"), ends_at: at("22:00") },
    { id: "touching", status: "confirmed", starts_at: at("22:00"), ends_at: at("23:00") }
  ];

  it("ignores the session itself, cancelled/declined sessions and touching ones", () => {
    expect(findOverlappingSession(sessions, "self", at("21:00"), at("22:00"))).toBeUndefined();
  });

  it("finds a live overlap", () => {
    const withClash = [...sessions, { id: "clash", status: "confirmed", starts_at: at("21:30"), ends_at: at("22:30") }];
    expect(findOverlappingSession(withClash, "self", at("21:00"), at("22:00"))?.id).toBe("clash");
  });
});
