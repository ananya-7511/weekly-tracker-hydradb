/// Status transition guards (FR-1..4) — the "no silent blanks" NFR and the
/// decision-quality bar enforced server-side, never trusted to client
/// validation alone. Pure functions over already-fetched data so they're
/// unit-testable without a database.

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
  twitterImpressions: number | null;
  twitterEngagement: number | null;
  twitterMetricsNaReason: string | null;
  blogOrganicSessions: number | null;
  blogOrganicSessionsNaReason: string | null;
  discordActiveMembers: number | null;
  discordTotalMembers: number | null;
  discordNaReason: string | null;
  discordNewMembers: number | null;
  discordNewMembersNaReason: string | null;
}

export interface SignalNoteLike {
  signalType: string;
  note: string | null;
  value: number | null;
  naReason: string | null;
}

export interface SearchVisibilityLike {
  brandedImpressions: number | null;
  naReason: string | null;
}

export interface ReportForLifecycleCheck {
  outcomeMetrics: OutcomeMetricsLike | null;
  channelMetrics: ChannelMetricsLike[];
  weeklyExtras: WeeklyExtrasLike | null;
  signalNotes: SignalNoteLike[];
  searchVisibility: SearchVisibilityLike | null;
}

/// Returns human-readable labels for every field that has neither a value nor
/// an explicit N/A reason — an empty array means the report is complete enough
/// to move to `ready_for_decisions` (FR-3).
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
  if (
    !ex ||
    !(
      isFilled(ex.twitterFollowerCount, ex.twitterMetricsNaReason) &&
      isFilled(ex.twitterImpressions, ex.twitterMetricsNaReason) &&
      isFilled(ex.twitterEngagement, ex.twitterMetricsNaReason)
    )
  )
    missing.push("Twitter Account Metrics");
  if (!ex || !isFilled(ex.blogOrganicSessions, ex.blogOrganicSessionsNaReason)) missing.push("Blog Organic Sessions");
  if (!ex || !(isFilled(ex.discordActiveMembers, ex.discordNaReason) && isFilled(ex.discordTotalMembers, ex.discordNaReason)))
    missing.push("Discord Active Members");
  if (!ex || !isFilled(ex.discordNewMembers, ex.discordNewMembersNaReason)) missing.push("Discord New Members");

  const REQUIRED_SIGNALS = ["source_quality", "time_to_activation", "organic_impressions", "churned_inactive"];
  for (const signalType of REQUIRED_SIGNALS) {
    const row = report.signalNotes.find((s) => s.signalType === signalType);
    if (!row || !(isFilled(row.note, row.naReason) || isFilled(row.value, row.naReason))) {
      missing.push(`Signal: ${signalType.replace(/_/g, " ")}`);
    }
  }

  const sv = report.searchVisibility;
  if (!sv || !isFilled(sv.brandedImpressions, sv.naReason)) missing.push("Branded Search Impressions");

  return missing;
}

export function canMoveToReadyForDecisions(report: ReportForLifecycleCheck): { ok: boolean; missingFields: string[] } {
  const missingFields = findMissingFields(report);
  return { ok: missingFields.length === 0, missingFields };
}

export interface DecisionLike {
  isSpecific: boolean;
  isTimeBound: boolean;
  isFalsifiable: boolean;
}

/// FR-4/FR-23: at least 2 decisions, every one fully self-certified. Not an
/// AI quality judgment — a checklist gate.
export function canPublish(decisions: DecisionLike[]): { ok: boolean; reason?: string } {
  if (decisions.length < 2) {
    return { ok: false, reason: `Needs at least 2 decisions (currently ${decisions.length}).` };
  }
  const incomplete = decisions.filter((d) => !(d.isSpecific && d.isTimeBound && d.isFalsifiable));
  if (incomplete.length > 0) {
    return { ok: false, reason: `${incomplete.length} decision(s) are missing a Specific/Time-bound/Falsifiable check.` };
  }
  return { ok: true };
}
