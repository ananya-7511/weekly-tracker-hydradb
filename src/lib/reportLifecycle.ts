/// The "no silent blanks" NFR (FR-3), enforced as a pure function over
/// already-fetched data so it's unit-testable without a database. Informational
/// only — this app is a metrics tracking tool, not a gated publish workflow (the
/// Decision log and status-transition gate that used to sit on top of this were
/// removed).

function isFilled(value: unknown, naReason: string | null | undefined): boolean {
  return (value !== null && value !== undefined) || Boolean(naReason && naReason.trim().length > 0);
}

export interface OutcomeMetricsLike {
  newSignups: number | null;
  newSignupsNaReason: string | null;
  totalUniqueVisitors: number | null;
  totalUniqueVisitorsNaReason: string | null;
}

export interface ChannelMetricsLike {
  utmSource: string;
  signups: number | null;
  naReason: string | null;
}

export interface WeeklyExtrasLike {
  topDevrelContentFreetext: string | null;
  topDevrelContentNaReason: string | null;
  twitterFollowerCount: number | null;
  twitterEngagement: number | null;
  twitterMetricsNaReason: string | null;
  twitterImpressions: number | null;
  twitterImpressionsNaReason: string | null;
  blogOrganicSessions: number | null;
  blogOrganicSessionsNaReason: string | null;
  discordActiveMembers: number | null;
  discordActiveMembersNaReason: string | null;
  discordTotalMembers: number | null;
  discordTotalMembersNaReason: string | null;
  discordNewMembers: number | null;
  discordNewMembersNaReason: string | null;
}

export interface SearchVisibilityLike {
  brandedImpressions: number | null;
  naReason: string | null;
}

export interface ReportForLifecycleCheck {
  outcomeMetrics: OutcomeMetricsLike | null;
  channelMetrics: ChannelMetricsLike[];
  weeklyExtras: WeeklyExtrasLike | null;
  searchVisibility: SearchVisibilityLike | null;
}

/// Returns human-readable labels for every field that has neither a value nor
/// an explicit N/A reason — purely informational (FR-3's "no silent blanks"),
/// not a gate on anything.
export function findMissingFields(report: ReportForLifecycleCheck): string[] {
  const missing: string[] = [];

  const om = report.outcomeMetrics;
  if (!om || !isFilled(om.newSignups, om.newSignupsNaReason)) missing.push("New Signups");
  if (!om || !isFilled(om.totalUniqueVisitors, om.totalUniqueVisitorsNaReason)) missing.push("Total Unique Website Visitors");

  for (const ch of report.channelMetrics) {
    if (!isFilled(ch.signups, ch.naReason)) missing.push(`Sign-Ups by Channel: ${ch.utmSource}`);
  }

  const ex = report.weeklyExtras;
  if (!ex || !isFilled(ex.topDevrelContentFreetext, ex.topDevrelContentNaReason)) missing.push("Top DevRel Content Piece");
  if (!ex || !(isFilled(ex.twitterFollowerCount, ex.twitterMetricsNaReason) && isFilled(ex.twitterEngagement, ex.twitterMetricsNaReason)))
    missing.push("Twitter Account Metrics");
  if (!ex || !isFilled(ex.twitterImpressions, ex.twitterImpressionsNaReason)) missing.push("Twitter Impressions");
  if (!ex || !isFilled(ex.blogOrganicSessions, ex.blogOrganicSessionsNaReason)) missing.push("Blog Organic Sessions");
  if (!ex || !isFilled(ex.discordActiveMembers, ex.discordActiveMembersNaReason)) missing.push("Discord Active Members");
  if (!ex || !isFilled(ex.discordTotalMembers, ex.discordTotalMembersNaReason)) missing.push("Discord Total Members");
  if (!ex || !isFilled(ex.discordNewMembers, ex.discordNewMembersNaReason)) missing.push("Discord New Members");

  const sv = report.searchVisibility;
  if (!sv || !isFilled(sv.brandedImpressions, sv.naReason)) missing.push("Branded Search Impressions");

  return missing;
}
