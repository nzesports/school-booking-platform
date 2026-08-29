import { describe, expect, it } from "vitest";

import { splitYearGroups, yearGroupChipClass } from "@/lib/domain/year-groups";

describe("year group helpers", () => {
  it("splits the separators accepted by staff inputs", () => {
    expect(splitYearGroups("Years 1 to 6, Years 7 to 8; Years 9 to 13 · Staff")).toEqual([
      "Years 1 to 6",
      "Years 7 to 8",
      "Years 9 to 13",
      "Staff"
    ]);
  });

  it("returns no chips for an empty value", () => {
    expect(splitYearGroups(null)).toEqual([]);
    expect(splitYearGroups("  ")).toEqual([]);
  });

  it("assigns stable styles to known and custom labels", () => {
    expect(yearGroupChipClass("Years 7 to 8")).toContain("#e6f5ee");
    expect(yearGroupChipClass("Custom Group")).toBe(yearGroupChipClass(" custom group "));
  });
});
