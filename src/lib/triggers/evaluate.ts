/// The Intervention Trigger Engine (FR-17/18/19) — pure rule functions, no
/// Prisma/DB access, so each rule is independently unit-testable. Every rule
/// takes plain history arrays (already fetched by src/lib/triggers/runner.ts)
/// ordered ascending by weekStartDate, with the LAST element always being the
/// week being evaluated. Thresholds come from TriggerConfig (FR-19) — never
/// hardcoded here except where the PRD itself doesn't define a configurable
/// threshold (documented inline where that's the case).

export type TriggerTypeValue =
  | "signups_down"
  | "low_activation"
  | "channel_dominant"
  | "channel_zero_streak"
  | "blog_growing"
  | "mentions_search_flat"
  | "mentions_platform_zero_streak"
  | "organic_share_declining";

export interface DetectedTrigger {
  triggerType: TriggerTypeValue;
  description: string;
}

export interface TriggerConfigMap {
  activation_floor_pct: number;
  channel_dominance_pct: number;
  zero_streak_weeks: number;
  mentions_search_lookback_days: number;
  mentions_zero_streak_weeks: number;
  organic_share_lookback_weeks: number;
}

export const TRIGGER_CONFIG_DEFAULTS: TriggerConfigMap = {
  activation_floor_pct: 20,
  channel_dominance_pct: 50,
  zero_streak_weeks: 3,
  mentions_search_lookback_days: 60,
  mentions_zero_streak_weeks: 2,
  organic_share_lookback_weeks: 4,
};

export interface OutcomeSnapshot {
  weekStartDate: Date;
  newSignups: number | null;
  activationRate: number | null;
  wowSignupGrowthPct: number | null;
}

/// Signups down WoW (Section 5) — the stored `wowSignupGrowthPct` is trusted
/// over recomputing it here, since FR-7 defines it as computed once at pull time.
export function detectSignupsDown(history: OutcomeSnapshot[]): DetectedTrigger[] {
  const current = history[history.length - 1];
  if (!current || current.wowSignupGrowthPct === null) return [];
  if (current.wowSignupGrowthPct < 0) {
    return [
      {
        triggerType: "signups_down",
        description: `Signups were down ${Math.abs(current.wowSignupGrowthPct).toFixed(1)}% week-over-week — identify which channel dropped and whether there was a content or product gap.`,
      },
    ];
  }
  return [];
}

/// Activation rate <20% — "flag to product with the specific PostHog drop-off
/// point, not a GTM fix" (Section 5). activationRate is stored as a 0-1 fraction.
export function detectLowActivation(history: OutcomeSnapshot[], config: TriggerConfigMap): DetectedTrigger[] {
  const current = history[history.length - 1];
  if (!current || current.activationRate === null) return [];
  const pct = current.activationRate * 100;
  if (pct < config.activation_floor_pct) {
    return [
      {
        triggerType: "low_activation",
        description: `Activation rate was ${pct.toFixed(1)}%, below the ${config.activation_floor_pct}% floor — this is a product problem, not a GTM one. Flag to product with the specific PostHog drop-off point.`,
      },
    ];
  }
  return [];
}

export interface ChannelSnapshot {
  utmSource: string;
  signups: number | null;
}

/// One channel significantly outperforming others (Section 5) — "double down
/// on it next week." Threshold is configurable (FR-19); PRD leaves the exact
/// % as an open question (Open Question #3), defaulted to 50%.
export function detectChannelDominance(
  currentWeekChannels: ChannelSnapshot[],
  config: TriggerConfigMap
): DetectedTrigger[] {
  const known = currentWeekChannels.filter((c) => c.signups !== null) as Array<{ utmSource: string; signups: number }>;
  const total = known.reduce((sum, c) => sum + c.signups, 0);
  if (total <= 0) return [];
  const top = known.reduce((max, c) => (c.signups > max.signups ? c : max), known[0]);
  const sharePct = (top.signups / total) * 100;
  if (sharePct >= config.channel_dominance_pct) {
    return [
      {
        triggerType: "channel_dominant",
        description: `"${top.utmSource}" drove ${sharePct.toFixed(0)}% of this week's signups (>= ${config.channel_dominance_pct}% threshold) — consider doubling down on it next week.`,
      },
    ];
  }
  return [];
}

export interface ChannelWeekSnapshot {
  weekStartDate: Date;
  utmSource: string;
  signups: number | null;
}

/// A channel at zero for N consecutive weeks ending at the current week
/// (Section 5) — "pause it; reallocate effort." Requires *stored* history
/// (Section 9.4) since a fresh PostHog pull can't answer a streak question.
/// A null (not-yet-pulled) week breaks the streak rather than counting as zero,
/// so an in-progress draft never falsely triggers this.
export function detectChannelZeroStreak(
  history: ChannelWeekSnapshot[],
  config: TriggerConfigMap
): DetectedTrigger[] {
  const byChannel = new Map<string, ChannelWeekSnapshot[]>();
  for (const row of history) {
    if (!byChannel.has(row.utmSource)) byChannel.set(row.utmSource, []);
    byChannel.get(row.utmSource)!.push(row);
  }

  const triggers: DetectedTrigger[] = [];
  for (const [utmSource, weeks] of byChannel) {
    const sorted = [...weeks].sort((a, b) => a.weekStartDate.getTime() - b.weekStartDate.getTime());
    const lastN = sorted.slice(-config.zero_streak_weeks);
    if (lastN.length < config.zero_streak_weeks) continue;
    const allZero = lastN.every((w) => w.signups === 0);
    if (allZero) {
      triggers.push({
        triggerType: "channel_zero_streak",
        description: `"${utmSource}" has had zero signups for ${config.zero_streak_weeks} consecutive weeks — pause it and reallocate effort.`,
      });
    }
  }
  return triggers;
}

export interface BlogSnapshot {
  weekStartDate: Date;
  blogOrganicSessions: number | null;
}

/// Blog organic sessions growing WoW (Section 5) — "identify the ranking
/// post/keyword; brief a related cluster post." An opportunity flag, not a
/// problem flag, but modeled the same way per FR-17.
export function detectBlogGrowing(history: BlogSnapshot[]): DetectedTrigger[] {
  if (history.length < 2) return [];
  const current = history[history.length - 1];
  const prior = history[history.length - 2];
  if (current.blogOrganicSessions === null || prior.blogOrganicSessions === null) return [];
  if (current.blogOrganicSessions > prior.blogOrganicSessions) {
    const deltaPct = prior.blogOrganicSessions > 0
      ? ((current.blogOrganicSessions - prior.blogOrganicSessions) / prior.blogOrganicSessions) * 100
      : 100;
    return [
      {
        triggerType: "blog_growing",
        description: `Blog organic sessions grew ${deltaPct.toFixed(0)}% week-over-week — identify the ranking post/keyword and brief a related cluster post.`,
      },
    ];
  }
  return [];
}

export interface MentionsSearchWeek {
  weekStartDate: Date;
  paidMentionsVerified: number | null;
  brandedImpressions: number | null;
}

/// Paid mentions rising but branded search impressions flat over the lookback
/// (default 60 days, matching the agency's own stated timeframe) — "the
/// service's own stated mechanism isn't showing up yet, worth a check-in with
/// the agency." HEURISTIC (the PRD doesn't define exact rising/flat
/// thresholds): "rising" = latest week's paid count exceeds the window's
/// earlier average by >20%; "flat" = branded impressions vary by <10% between
/// the window's first and last available weeks. Documented here since these
/// two percentages aren't in TriggerConfig — revisit if they prove too
/// sensitive/insensitive in practice.
export function detectMentionsSearchFlat(
  history: MentionsSearchWeek[],
  config: TriggerConfigMap
): DetectedTrigger[] {
  const lookbackWeeks = Math.ceil(config.mentions_search_lookback_days / 7);
  const window = history.slice(-lookbackWeeks);
  if (window.length < 3) return [];

  const paidValues = window.map((w) => w.paidMentionsVerified).filter((v): v is number => v !== null);
  const impressionValues = window.map((w) => w.brandedImpressions).filter((v): v is number => v !== null);
  if (paidValues.length < 3 || impressionValues.length < 2) return [];

  const latestPaid = paidValues[paidValues.length - 1];
  const earlierPaidAvg =
    paidValues.slice(0, -1).reduce((sum, v) => sum + v, 0) / Math.max(1, paidValues.length - 1);
  const isRising = earlierPaidAvg > 0 && (latestPaid - earlierPaidAvg) / earlierPaidAvg > 0.2;

  const firstImpressions = impressionValues[0];
  const lastImpressions = impressionValues[impressionValues.length - 1];
  const impressionChangePct = firstImpressions > 0 ? Math.abs((lastImpressions - firstImpressions) / firstImpressions) * 100 : 0;
  const isFlat = impressionChangePct < 10;

  if (isRising && isFlat) {
    return [
      {
        triggerType: "mentions_search_flat",
        description: `Paid mentions volume has risen over the last ${lookbackWeeks} weeks while branded search impressions stayed roughly flat (${impressionChangePct.toFixed(0)}% change) — worth a check-in with the CommunityMentions agency.`,
      },
    ];
  }
  return [];
}

export interface PlatformWeekSnapshot {
  weekStartDate: Date;
  platform: string;
  verifiedCount: number;
}

/// A platform in Paid Mentions at zero verified for N+ consecutive weeks
/// (Section 5) — "comments aren't clearing verification on that channel, flag
/// to the agency."
export function detectMentionsPlatformZeroStreak(
  history: PlatformWeekSnapshot[],
  config: TriggerConfigMap
): DetectedTrigger[] {
  const byPlatform = new Map<string, PlatformWeekSnapshot[]>();
  for (const row of history) {
    if (!byPlatform.has(row.platform)) byPlatform.set(row.platform, []);
    byPlatform.get(row.platform)!.push(row);
  }

  const triggers: DetectedTrigger[] = [];
  for (const [platform, weeks] of byPlatform) {
    const sorted = [...weeks].sort((a, b) => a.weekStartDate.getTime() - b.weekStartDate.getTime());
    const lastN = sorted.slice(-config.mentions_zero_streak_weeks);
    if (lastN.length < config.mentions_zero_streak_weeks) continue;
    if (lastN.every((w) => w.verifiedCount === 0)) {
      triggers.push({
        triggerType: "mentions_platform_zero_streak",
        description: `${platform} has had zero verified paid mentions for ${config.mentions_zero_streak_weeks}+ consecutive weeks — flag to the agency rather than letting the spend continue unexamined.`,
      });
    }
  }
  return triggers;
}

export interface OrganicShareWeek {
  weekStartDate: Date;
  paidTotal: number;
  organicTotal: number;
}

/// Organic share of the paid/organic split trending toward zero over the
/// lookback (Section 5) — "may mean genuine advocacy isn't growing even as
/// paid volume is." Flags when the share is monotonically non-increasing
/// across the whole window AND has dropped by more than 5 percentage points
/// (an undocumented-in-the-PRD magnitude threshold, chosen to avoid flagging
/// single-week noise — revisit alongside the lookback config if needed).
export function detectOrganicShareDeclining(
  history: OrganicShareWeek[],
  config: TriggerConfigMap
): DetectedTrigger[] {
  const window = history.slice(-(config.organic_share_lookback_weeks + 1));
  if (window.length < 3) return [];

  const shares = window.map((w) => {
    const total = w.paidTotal + w.organicTotal;
    return total > 0 ? (w.organicTotal / total) * 100 : null;
  });
  if (shares.some((s) => s === null)) return [];
  const values = shares as number[];

  let monotonicNonIncreasing = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1] + 0.01) {
      monotonicNonIncreasing = false;
      break;
    }
  }
  const dropPct = values[0] - values[values.length - 1];

  if (monotonicNonIncreasing && dropPct > 5) {
    return [
      {
        triggerType: "organic_share_declining",
        description: `Organic share of mentions has declined from ${values[0].toFixed(0)}% to ${values[values.length - 1].toFixed(0)}% over the last ${config.organic_share_lookback_weeks} weeks — genuine advocacy may not be growing even as paid volume is.`,
      },
    ];
  }
  return [];
}
