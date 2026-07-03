import { describe, it, expect } from "vitest";
import { findMissingFields, canMoveToReadyForDecisions, canPublish, type ReportForLifecycleCheck } from "./reportLifecycle";

function completeReport(): ReportForLifecycleCheck {
  return {
    outcomeMetrics: { newSignups: 50, newSignupsNaReason: null, activatedUsers: 15, activatedUsersNaReason: null },
    channelMetrics: [{ utmSource: "twitter", signups: 20, naReason: null }],
    weeklyExtras: {
      topDevrelContentFreetext: "A post",
      topDevrelContentNaReason: null,
      twitterImpressionsOrganic: 100,
      twitterImpressionsInfluencer: 50,
      twitterImpressionsNaReason: null,
      blogOrganicSessions: 200,
      blogOrganicSessionsNaReason: null,
      discordActiveMembers: 40,
      discordTotalMembers: 100,
      discordNaReason: null,
    },
    signalNotes: [
      { signalType: "source_quality", note: "Good ICP", value: null, naReason: null },
      { signalType: "time_to_activation", note: null, value: 2, naReason: null },
      { signalType: "organic_impressions", note: "None this week", value: null, naReason: null },
      { signalType: "churned_inactive", note: null, value: 3, naReason: null },
    ],
    searchVisibility: { brandedImpressions: 500, naReason: null },
  };
}

describe("findMissingFields / canMoveToReadyForDecisions", () => {
  it("finds no missing fields on a fully filled report", () => {
    expect(findMissingFields(completeReport())).toEqual([]);
    expect(canMoveToReadyForDecisions(completeReport())).toEqual({ ok: true, missingFields: [] });
  });

  it("treats an explicit N/A reason as filled, not missing", () => {
    const report = completeReport();
    report.outcomeMetrics = { newSignups: null, newSignupsNaReason: "N/A — PostHog pull failed", activatedUsers: 15, activatedUsersNaReason: null };
    expect(findMissingFields(report)).toEqual([]);
  });

  it("flags a genuinely blank field (no value, no N/A reason)", () => {
    const report = completeReport();
    report.outcomeMetrics = { newSignups: null, newSignupsNaReason: null, activatedUsers: 15, activatedUsersNaReason: null };
    const missing = findMissingFields(report);
    expect(missing).toContain("New Signups");
    expect(canMoveToReadyForDecisions(report).ok).toBe(false);
  });

  it("flags a channel row with neither a signup count nor an N/A reason", () => {
    const report = completeReport();
    report.channelMetrics = [{ utmSource: "reddit-ads", signups: null, naReason: null }];
    expect(findMissingFields(report)).toContain("Sign-Ups by Channel: reddit-ads");
  });

  it("flags a missing required signal note", () => {
    const report = completeReport();
    report.signalNotes = report.signalNotes.filter((s) => s.signalType !== "churned_inactive");
    expect(findMissingFields(report)).toContain("Signal: churned inactive");
  });
});

describe("canPublish", () => {
  it("rejects fewer than 2 decisions", () => {
    expect(canPublish([{ isSpecific: true, isTimeBound: true, isFalsifiable: true }]).ok).toBe(false);
  });

  it("rejects decisions missing a quality checkbox", () => {
    const result = canPublish([
      { isSpecific: true, isTimeBound: true, isFalsifiable: true },
      { isSpecific: true, isTimeBound: false, isFalsifiable: true },
    ]);
    expect(result.ok).toBe(false);
  });

  it("accepts 2+ fully self-certified decisions", () => {
    const result = canPublish([
      { isSpecific: true, isTimeBound: true, isFalsifiable: true },
      { isSpecific: true, isTimeBound: true, isFalsifiable: true },
    ]);
    expect(result.ok).toBe(true);
  });
});
