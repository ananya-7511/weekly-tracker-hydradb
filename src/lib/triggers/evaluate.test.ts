import { describe, it, expect } from "vitest";
import {
  TRIGGER_CONFIG_DEFAULTS,
  detectSignupsDown,
  detectChannelDominance,
  detectChannelZeroStreak,
  detectBlogGrowing,
  detectMentionsSearchFlat,
  detectMentionsPlatformZeroStreak,
  detectOrganicShareDeclining,
} from "./evaluate";

const d = (isoDate: string) => new Date(isoDate);

describe("detectSignupsDown", () => {
  it("flags a negative WoW growth", () => {
    const result = detectSignupsDown([{ weekStartDate: d("2026-06-01"), newSignups: 50, wowSignupGrowthPct: -12.5 }]);
    expect(result).toHaveLength(1);
    expect(result[0].triggerType).toBe("signups_down");
  });

  it("does not flag positive growth or a null (not-yet-pulled) week", () => {
    expect(detectSignupsDown([{ weekStartDate: d("2026-06-01"), newSignups: 50, wowSignupGrowthPct: 5 }])).toHaveLength(0);
    expect(
      detectSignupsDown([{ weekStartDate: d("2026-06-01"), newSignups: null, wowSignupGrowthPct: null }])
    ).toHaveLength(0);
  });
});

describe("detectChannelDominance", () => {
  it("flags a channel at or above the dominance threshold", () => {
    const result = detectChannelDominance(
      [
        { utmSource: "twitter", signups: 60 },
        { utmSource: "blog", signups: 20 },
        { utmSource: "discord", signups: 20 },
      ],
      TRIGGER_CONFIG_DEFAULTS
    );
    expect(result).toHaveLength(1);
    expect(result[0].description).toContain("twitter");
  });

  it("ignores unpulled (null) channels and does not flag a balanced split", () => {
    const result = detectChannelDominance(
      [
        { utmSource: "twitter", signups: 34 },
        { utmSource: "blog", signups: 33 },
        { utmSource: "discord", signups: 33 },
        { utmSource: "unpulled", signups: null },
      ],
      TRIGGER_CONFIG_DEFAULTS
    );
    expect(result).toHaveLength(0);
  });
});

describe("detectChannelZeroStreak", () => {
  it("flags a channel at zero for the configured number of consecutive weeks", () => {
    const history = [
      { weekStartDate: d("2026-05-04"), utmSource: "reddit-ads", signups: 5 },
      { weekStartDate: d("2026-05-11"), utmSource: "reddit-ads", signups: 0 },
      { weekStartDate: d("2026-05-18"), utmSource: "reddit-ads", signups: 0 },
      { weekStartDate: d("2026-05-25"), utmSource: "reddit-ads", signups: 0 },
    ];
    const result = detectChannelZeroStreak(history, TRIGGER_CONFIG_DEFAULTS);
    expect(result).toHaveLength(1);
    expect(result[0].description).toContain("reddit-ads");
  });

  it("does not flag when a week in the streak is unpulled (null) rather than zero", () => {
    const history = [
      { weekStartDate: d("2026-05-04"), utmSource: "reddit-ads", signups: 0 },
      { weekStartDate: d("2026-05-11"), utmSource: "reddit-ads", signups: null },
      { weekStartDate: d("2026-05-18"), utmSource: "reddit-ads", signups: 0 },
      { weekStartDate: d("2026-05-25"), utmSource: "reddit-ads", signups: 0 },
    ];
    expect(detectChannelZeroStreak(history, TRIGGER_CONFIG_DEFAULTS)).toHaveLength(0);
  });

  it("does not flag with fewer weeks of history than the streak threshold", () => {
    const history = [
      { weekStartDate: d("2026-05-18"), utmSource: "reddit-ads", signups: 0 },
      { weekStartDate: d("2026-05-25"), utmSource: "reddit-ads", signups: 0 },
    ];
    expect(detectChannelZeroStreak(history, TRIGGER_CONFIG_DEFAULTS)).toHaveLength(0);
  });
});

describe("detectBlogGrowing", () => {
  it("flags growth over the prior week", () => {
    const result = detectBlogGrowing([
      { weekStartDate: d("2026-05-25"), blogOrganicSessions: 100 },
      { weekStartDate: d("2026-06-01"), blogOrganicSessions: 150 },
    ]);
    expect(result).toHaveLength(1);
  });

  it("does not flag a decline or a missing prior week", () => {
    expect(
      detectBlogGrowing([
        { weekStartDate: d("2026-05-25"), blogOrganicSessions: 150 },
        { weekStartDate: d("2026-06-01"), blogOrganicSessions: 100 },
      ])
    ).toHaveLength(0);
    expect(detectBlogGrowing([{ weekStartDate: d("2026-06-01"), blogOrganicSessions: 150 }])).toHaveLength(0);
  });
});

describe("detectMentionsSearchFlat", () => {
  it("flags rising paid mentions alongside flat branded search impressions", () => {
    const history = Array.from({ length: 9 }, (_, i) => ({
      weekStartDate: d(`2026-0${Math.min(9, 4 + i)}-01`),
      paidMentionsVerified: i === 8 ? 40 : 10,
      brandedImpressions: 500 + (i % 2),
    }));
    const result = detectMentionsSearchFlat(history, TRIGGER_CONFIG_DEFAULTS);
    expect(result).toHaveLength(1);
  });

  it("does not flag when search impressions are also rising", () => {
    const history = Array.from({ length: 9 }, (_, i) => ({
      weekStartDate: d(`2026-0${Math.min(9, 4 + i)}-01`),
      paidMentionsVerified: i === 8 ? 40 : 10,
      brandedImpressions: 200 + i * 100,
    }));
    expect(detectMentionsSearchFlat(history, TRIGGER_CONFIG_DEFAULTS)).toHaveLength(0);
  });
});

describe("detectMentionsPlatformZeroStreak", () => {
  it("flags a platform at zero verified for the configured streak", () => {
    const history = [
      { weekStartDate: d("2026-06-01"), platform: "linkedin", verifiedCount: 0 },
      { weekStartDate: d("2026-06-08"), platform: "linkedin", verifiedCount: 0 },
    ];
    const result = detectMentionsPlatformZeroStreak(history, TRIGGER_CONFIG_DEFAULTS);
    expect(result).toHaveLength(1);
    expect(result[0].description).toContain("linkedin");
  });

  it("does not flag a platform with any nonzero week in the streak window", () => {
    const history = [
      { weekStartDate: d("2026-06-01"), platform: "linkedin", verifiedCount: 1 },
      { weekStartDate: d("2026-06-08"), platform: "linkedin", verifiedCount: 0 },
    ];
    expect(detectMentionsPlatformZeroStreak(history, TRIGGER_CONFIG_DEFAULTS)).toHaveLength(0);
  });
});

describe("detectOrganicShareDeclining", () => {
  it("flags a monotonic decline exceeding the magnitude threshold", () => {
    const history = [
      { weekStartDate: d("2026-05-04"), paidTotal: 80, organicTotal: 20 },
      { weekStartDate: d("2026-05-11"), paidTotal: 85, organicTotal: 15 },
      { weekStartDate: d("2026-05-18"), paidTotal: 90, organicTotal: 10 },
      { weekStartDate: d("2026-05-25"), paidTotal: 95, organicTotal: 5 },
      { weekStartDate: d("2026-06-01"), paidTotal: 98, organicTotal: 2 },
    ];
    const result = detectOrganicShareDeclining(history, TRIGGER_CONFIG_DEFAULTS);
    expect(result).toHaveLength(1);
  });

  it("does not flag a stable or rising organic share", () => {
    const history = [
      { weekStartDate: d("2026-05-04"), paidTotal: 80, organicTotal: 20 },
      { weekStartDate: d("2026-05-11"), paidTotal: 80, organicTotal: 22 },
      { weekStartDate: d("2026-05-18"), paidTotal: 80, organicTotal: 25 },
      { weekStartDate: d("2026-05-25"), paidTotal: 80, organicTotal: 28 },
      { weekStartDate: d("2026-06-01"), paidTotal: 80, organicTotal: 30 },
    ];
    expect(detectOrganicShareDeclining(history, TRIGGER_CONFIG_DEFAULTS)).toHaveLength(0);
  });
});
