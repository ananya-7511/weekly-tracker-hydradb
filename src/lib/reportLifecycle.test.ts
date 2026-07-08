import { describe, it, expect } from "vitest";
import { findMissingFields, type ReportForLifecycleCheck } from "./reportLifecycle";

function completeReport(): ReportForLifecycleCheck {
  return {
    outcomeMetrics: { newSignups: 50, newSignupsNaReason: null, totalUniqueVisitors: 300, totalUniqueVisitorsNaReason: null },
    channelMetrics: [{ utmSource: "twitter", signups: 20, naReason: null }],
    weeklyExtras: {
      topDevrelContentFreetext: "A post",
      topDevrelContentNaReason: null,
      twitterFollowerCount: 1000,
      twitterEngagement: 300,
      twitterMetricsNaReason: null,
      twitterImpressions: 5000,
      twitterImpressionsNaReason: null,
      blogOrganicSessions: 200,
      blogOrganicSessionsNaReason: null,
      discordActiveMembers: 40,
      discordActiveMembersNaReason: null,
      discordTotalMembers: 100,
      discordTotalMembersNaReason: null,
      discordNewMembers: 10,
      discordNewMembersNaReason: null,
    },
    searchVisibility: { brandedImpressions: 500, naReason: null },
  };
}

describe("findMissingFields", () => {
  it("finds no missing fields on a fully filled report", () => {
    expect(findMissingFields(completeReport())).toEqual([]);
  });

  it("treats an explicit N/A reason as filled, not missing", () => {
    const report = completeReport();
    report.outcomeMetrics = { newSignups: null, newSignupsNaReason: "N/A — PostHog pull failed", totalUniqueVisitors: 300, totalUniqueVisitorsNaReason: null };
    expect(findMissingFields(report)).toEqual([]);
  });

  it("flags a genuinely blank field (no value, no N/A reason)", () => {
    const report = completeReport();
    report.outcomeMetrics = { newSignups: null, newSignupsNaReason: null, totalUniqueVisitors: 300, totalUniqueVisitorsNaReason: null };
    expect(findMissingFields(report)).toContain("New Signups");
  });

  it("does not treat Twitter Impressions as satisfied just because the auto-pulled follower/engagement fields cleared their own shared reason", () => {
    // Regression: twitterImpressions used to share twitterMetricsNaReason with
    // the auto-pulled fields, so a successful account-health pull (which clears
    // that shared reason) would silently mark Impressions as filled even though
    // it has neither a value nor its own reason.
    const report = completeReport();
    report.weeklyExtras = {
      ...report.weeklyExtras!,
      twitterFollowerCount: 1200,
      twitterEngagement: 400,
      twitterMetricsNaReason: null,
      twitterImpressions: null,
      twitterImpressionsNaReason: null,
    };
    expect(findMissingFields(report)).toContain("Twitter Impressions");
  });

  it("does not treat Discord Active Members as satisfied just because an auto-pulled Total Members clears its own reason", () => {
    // Same class of bug as Twitter Impressions above: discordTotalMembers is
    // now auto-pullable via the Discord API while discordActiveMembers stays
    // manual — they must never share one reason field.
    const report = completeReport();
    report.weeklyExtras = {
      ...report.weeklyExtras!,
      discordTotalMembers: 550,
      discordTotalMembersNaReason: null,
      discordActiveMembers: null,
      discordActiveMembersNaReason: null,
    };
    expect(findMissingFields(report)).toContain("Discord Active Members");
  });

  it("flags a channel row with neither a signup count nor an N/A reason", () => {
    const report = completeReport();
    report.channelMetrics = [{ utmSource: "reddit-ads", signups: null, naReason: null }];
    expect(findMissingFields(report)).toContain("Sign-Ups by Channel: reddit-ads");
  });
});
