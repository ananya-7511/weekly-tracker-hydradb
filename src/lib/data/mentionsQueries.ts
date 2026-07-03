import { prisma } from "@/lib/prisma";
import { weekEndOf } from "@/lib/dateWindow";
import type { BrandMention } from "@prisma/client";

export interface PaidOrganicSplit {
  paidVerifiedCount: number;
  organicCount: number;
  paidSharePct: number | null;
  organicSharePct: number | null;
}

/// FR-33a's computed split — only `verified` paid mentions count (Section 5),
/// every organic entry counts (no verification lifecycle for those).
export function computeSplit(mentions: Pick<BrandMention, "mentionSource" | "status">[]): PaidOrganicSplit {
  const paidVerifiedCount = mentions.filter((m) => m.mentionSource === "paid" && m.status === "verified").length;
  const organicCount = mentions.filter((m) => m.mentionSource === "organic").length;
  const total = paidVerifiedCount + organicCount;
  return {
    paidVerifiedCount,
    organicCount,
    paidSharePct: total > 0 ? (paidVerifiedCount / total) * 100 : null,
    organicSharePct: total > 0 ? (organicCount / total) * 100 : null,
  };
}

export async function getMentionsForRange(from: Date, to: Date) {
  return prisma.brandMention.findMany({
    where: { postedDate: { gte: from, lte: to } },
    orderBy: { postedDate: "desc" },
  });
}

export interface WeekMentionsAggregate {
  paidVerifiedTotal: number;
  organicTotal: number;
  paidVerifiedByPlatform: Record<string, number>;
}

function weekKey(d: Date): string {
  return d.toISOString();
}

/// Shared by the trigger engine (src/lib/triggers/runner.ts, which needs
/// per-platform breakdowns for the zero-streak trigger) and the trends page
/// (which needs simple weekly totals) — one date-range aggregation, two callers.
export async function getWeeklyMentionsAggregates(weekStarts: Date[]): Promise<Map<string, WeekMentionsAggregate>> {
  const result = new Map<string, WeekMentionsAggregate>();
  await Promise.all(
    weekStarts.map(async (weekStart) => {
      const weekEnd = weekEndOf(weekStart);
      const mentions = await prisma.brandMention.findMany({
        where: { postedDate: { gte: weekStart, lte: weekEnd } },
        select: { mentionSource: true, platform: true, status: true },
      });
      const agg: WeekMentionsAggregate = { paidVerifiedTotal: 0, organicTotal: 0, paidVerifiedByPlatform: {} };
      for (const m of mentions) {
        if (m.mentionSource === "paid" && m.status === "verified") {
          agg.paidVerifiedTotal++;
          agg.paidVerifiedByPlatform[m.platform] = (agg.paidVerifiedByPlatform[m.platform] ?? 0) + 1;
        } else if (m.mentionSource === "organic") {
          agg.organicTotal++;
        }
      }
      result.set(weekKey(weekStart), agg);
    })
  );
  return result;
}

export function mentionsWeekKey(d: Date): string {
  return weekKey(d);
}
