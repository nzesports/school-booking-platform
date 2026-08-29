import { describe, expect, it } from "vitest";

import {
  formatCurrency,
  initials,
  nzDateTimeToIso,
  slugify,
  splitCommaList,
  titleCase,
  toYouTubeEmbedUrl
} from "@/lib/utils";

describe("shared formatting helpers", () => {
  it("normalises labels, slugs, initials and comma lists", () => {
    expect(titleCase("school_admin-user")).toBe("School Admin User");
    expect(slugify("  Te Tai Tokerau / Northland  ")).toBe("te-tai-tokerau-northland");
    expect(initials("Aroha Te Rangi")).toBe("AT");
    expect(splitCommaList("one, two, ,three")).toEqual(["one", "two", "three"]);
  });

  it("formats NZD cents without fractional digits", () => {
    expect(formatCurrency(123_400)).toContain("1,234");
  });

  it("converts New Zealand local times across daylight-saving offsets", () => {
    expect(nzDateTimeToIso("2026-01-15", "09:30")).toBe("2026-01-14T20:30:00.000Z");
    expect(nzDateTimeToIso("2026-07-15", "09:30")).toBe("2026-07-14T21:30:00.000Z");
  });

  it("recognises supported YouTube URL forms", () => {
    expect(toYouTubeEmbedUrl("https://youtu.be/abc-123")).toBe(
      "https://www.youtube.com/embed/abc-123"
    );
    expect(toYouTubeEmbedUrl("https://www.youtube.com/watch?v=xyz_789")).toBe(
      "https://www.youtube.com/embed/xyz_789"
    );
    expect(toYouTubeEmbedUrl("https://www.youtube.com/shorts/short-id")).toBe(
      "https://www.youtube.com/embed/short-id"
    );
    expect(toYouTubeEmbedUrl("https://example.com/video")).toBeNull();
  });
});
