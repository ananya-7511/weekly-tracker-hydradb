/// Historical trend data (FR-24) — "has this actually grown since Week 1" as a
/// chart, not a manual dig through old reports.
import { prisma } from "@/lib/prisma";
import { formatWeekLabel } from "@/lib/dateWindow";
import { getWeeklyMentionsAggregates, mentionsWeekKey } from "@/lib/data/mentionsQueries";

export interface TrendPoint {
  week: string;
  newSignups: number | null;
  primaryConversionRatePct: number | null;
  blogOrganicSessions: number | null;
  brandedImpressions: number | null;
  paidMentions: number;
  organicMentions: number;
  totalMentions: number;
}

export interface ChannelTrendPoint {
  week: string;
  [utmSource: string]: string | number;
}

export interface TrendData {
  points: TrendPoint[];
  channelPoints: ChannelTrendPoint[];
  channelNames: string[];
}

export async function getTrendData(): Promise<TrendData> {
  const reports = await prisma.weeklyReport.findMany({
    orderBy: { weekStartDate: "asc" },
    include: { outcomeMetrics: true, channelMetrics: true, weeklyExtras: true, searchVisibility: true },
  });

  const weekStarts = reports.map((r) => r.weekStartDate);
  const mentionsAgg = await getWeeklyMentionsAggregates(weekStarts);

  const points: TrendPoint[] = reports.map((r) => {
    const agg = mentionsAgg.get(mentionsWeekKey(r.weekStartDate));
    const paidMentions = agg?.paidVerifiedTotal ?? 0;
    const organicMentions = agg?.organicTotal ?? 0;
    return {
      week: formatWeekLabel(r.weekStartDate),
      newSignups: r.outcomeMetrics?.newSignups ?? null,
      primaryConversionRatePct: r.outcomeMetrics?.primaryConversionRatePct ?? null,
      blogOrganicSessions: r.weeklyExtras?.blogOrganicSessions ?? null,
      brandedImpressions: r.searchVisibility?.brandedImpressions ?? null,
      paidMentions,
      organicMentions,
      totalMentions: paidMentions + organicMentions,
    };
  });

  const channelNames = [...new Set(reports.flatMap((r) => r.channelMetrics.map((c) => c.utmSource)))].sort();
  const channelPoints: ChannelTrendPoint[] = reports.map((r) => {
    const row: ChannelTrendPoint = { week: formatWeekLabel(r.weekStartDate) };
    for (const name of channelNames) {
      const match = r.channelMetrics.find((c) => c.utmSource === name);
      row[name] = match?.signups ?? 0;
    }
    return row;
  });

  return { points, channelPoints, channelNames };
}
