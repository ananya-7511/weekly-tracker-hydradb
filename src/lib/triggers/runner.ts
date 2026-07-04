/// DB-facing orchestrator for the trigger engine — fetches the stored history
/// each rule needs (Section 9.4: these questions can't be answered by a fresh
/// API pull, only by reading prior WeeklyReport rows) and persists the result
/// as InterventionFlag rows. All actual rule logic lives in ./evaluate.ts as
/// pure, independently-tested functions.
import { prisma } from "@/lib/prisma";
import { getWeeklyMentionsAggregates, mentionsWeekKey } from "@/lib/data/mentionsQueries";
import {
  TRIGGER_CONFIG_DEFAULTS,
  detectSignupsDown,
  detectChannelDominance,
  detectChannelZeroStreak,
  detectBlogGrowing,
  detectMentionsSearchFlat,
  detectMentionsPlatformZeroStreak,
  detectOrganicShareDeclining,
  type TriggerConfigMap,
  type DetectedTrigger,
  type OutcomeSnapshot,
  type ChannelWeekSnapshot,
  type BlogSnapshot,
  type MentionsSearchWeek,
  type PlatformWeekSnapshot,
  type OrganicShareWeek,
} from "./evaluate";

const CONFIG_KEYS = Object.keys(TRIGGER_CONFIG_DEFAULTS) as Array<keyof TriggerConfigMap>;
const MAX_LOOKBACK_WEEKS = 12;
const ALL_PAID_PLATFORMS = ["reddit", "youtube", "medium", "linkedin", "x"] as const;

async function loadTriggerConfig(): Promise<TriggerConfigMap> {
  const rows = await prisma.triggerConfig.findMany();
  const map: TriggerConfigMap = { ...TRIGGER_CONFIG_DEFAULTS };
  for (const row of rows) {
    if ((CONFIG_KEYS as string[]).includes(row.key)) {
      (map as unknown as Record<string, number>)[row.key] = row.value;
    }
  }
  return map;
}

/// Evaluates all 8 rules for a report and replaces its auto-detected flags
/// (manually-created flags, if any are ever added, are left untouched — this
/// only clears rows it itself created, keyed on `autoDetected: true`).
export async function evaluateTriggersForReport(reportId: string): Promise<DetectedTrigger[]> {
  const report = await prisma.weeklyReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error(`WeeklyReport ${reportId} not found`);

  const config = await loadTriggerConfig();

  const priorReports = await prisma.weeklyReport.findMany({
    where: { weekStartDate: { lte: report.weekStartDate } },
    orderBy: { weekStartDate: "desc" },
    take: MAX_LOOKBACK_WEEKS,
    include: { outcomeMetrics: true, channelMetrics: true, weeklyExtras: true, searchVisibility: true },
  });
  const history = [...priorReports].reverse(); // ascending; current week is last

  const weekStarts = history.map((r) => r.weekStartDate);
  const mentionsAgg = await getWeeklyMentionsAggregates(weekStarts);

  const outcomeHistory: OutcomeSnapshot[] = history.map((r) => ({
    weekStartDate: r.weekStartDate,
    newSignups: r.outcomeMetrics?.newSignups ?? null,
    wowSignupGrowthPct: r.outcomeMetrics?.wowSignupGrowthPct ?? null,
  }));

  const currentWeekChannels = (history[history.length - 1]?.channelMetrics ?? []).map((c) => ({
    utmSource: c.utmSource,
    signups: c.signups,
  }));

  const channelHistory: ChannelWeekSnapshot[] = history.flatMap((r) =>
    r.channelMetrics.map((c) => ({ weekStartDate: r.weekStartDate, utmSource: c.utmSource, signups: c.signups }))
  );

  const blogHistory: BlogSnapshot[] = history.map((r) => ({
    weekStartDate: r.weekStartDate,
    blogOrganicSessions: r.weeklyExtras?.blogOrganicSessions ?? null,
  }));

  const mentionsSearchHistory: MentionsSearchWeek[] = history.map((r) => {
    const agg = mentionsAgg.get(mentionsWeekKey(r.weekStartDate));
    return {
      weekStartDate: r.weekStartDate,
      paidMentionsVerified: agg?.paidVerifiedTotal ?? 0,
      brandedImpressions: r.searchVisibility?.brandedImpressions ?? null,
    };
  });

  const platformHistory: PlatformWeekSnapshot[] = history.flatMap((r) => {
    const agg = mentionsAgg.get(mentionsWeekKey(r.weekStartDate));
    return ALL_PAID_PLATFORMS.map((platform) => ({
      weekStartDate: r.weekStartDate,
      platform,
      verifiedCount: agg?.paidVerifiedByPlatform[platform] ?? 0,
    }));
  });

  const organicShareHistory: OrganicShareWeek[] = history.map((r) => {
    const agg = mentionsAgg.get(mentionsWeekKey(r.weekStartDate));
    return { weekStartDate: r.weekStartDate, paidTotal: agg?.paidVerifiedTotal ?? 0, organicTotal: agg?.organicTotal ?? 0 };
  });

  const detected: DetectedTrigger[] = [
    ...detectSignupsDown(outcomeHistory),
    ...detectChannelDominance(currentWeekChannels, config),
    ...detectChannelZeroStreak(channelHistory, config),
    ...detectBlogGrowing(blogHistory),
    ...detectMentionsSearchFlat(mentionsSearchHistory, config),
    ...detectMentionsPlatformZeroStreak(platformHistory, config),
    ...detectOrganicShareDeclining(organicShareHistory, config),
  ];

  await prisma.interventionFlag.deleteMany({ where: { reportId, autoDetected: true } });
  if (detected.length > 0) {
    await prisma.interventionFlag.createMany({
      data: detected.map((t) => ({
        reportId,
        triggerType: t.triggerType,
        autoDetected: true,
        description: t.description,
      })),
    });
  }

  return detected;
}
