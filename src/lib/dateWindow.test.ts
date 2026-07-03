import { describe, it, expect } from "vitest";
import { mondayOf, weekEndOf, priorWeekStart, weeksBefore, formatWeekLabel } from "./dateWindow";

describe("mondayOf", () => {
  it("returns the same date when already a Monday", () => {
    expect(formatWeekLabel(mondayOf(new Date("2026-06-29T15:00:00Z")))).toBe("2026-06-29");
  });

  it("rolls forward to Monday for other weekdays", () => {
    expect(formatWeekLabel(mondayOf(new Date("2026-07-01T00:00:00Z")))).toBe("2026-06-29"); // Wednesday
    expect(formatWeekLabel(mondayOf(new Date("2026-07-04T00:00:00Z")))).toBe("2026-06-29"); // Saturday
  });

  it("handles Sunday correctly (belongs to the preceding Monday's week)", () => {
    expect(formatWeekLabel(mondayOf(new Date("2026-07-05T00:00:00Z")))).toBe("2026-06-29");
  });
});

describe("weekEndOf / priorWeekStart / weeksBefore", () => {
  it("computes the Sunday 6 days after a Monday", () => {
    const monday = mondayOf(new Date("2026-06-29T00:00:00Z"));
    expect(weekEndOf(monday).toISOString().slice(0, 10)).toBe("2026-07-05");
  });

  it("computes the prior week's Monday", () => {
    const monday = mondayOf(new Date("2026-06-29T00:00:00Z"));
    expect(formatWeekLabel(priorWeekStart(monday))).toBe("2026-06-22");
  });

  it("computes N weeks before", () => {
    const monday = mondayOf(new Date("2026-06-29T00:00:00Z"));
    expect(formatWeekLabel(weeksBefore(monday, 3))).toBe("2026-06-08");
  });
});
