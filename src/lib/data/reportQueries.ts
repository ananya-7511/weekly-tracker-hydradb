import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mondayOf, weekEndOf } from "@/lib/dateWindow";

const SIGNAL_TYPES = ["source_quality", "time_to_activation", "organic_impressions", "churned_inactive"] as const;

const FULL_REPORT_INCLUDE = {
  outcomeMetrics: true,
  channelMetrics: { orderBy: { utmSource: "asc" as const } },
  weeklyExtras: true,
  signalNotes: true,
  searchVisibility: true,
  brandMentions: { orderBy: { postedDate: "desc" as const } },
  interventionFlags: { orderBy: { createdAt: "asc" as const } },
  decisions: { orderBy: { createdAt: "asc" as const } },
};

export type FullReport = NonNullable<Awaited<ReturnType<typeof getReportByWeekStart>>>;

/// FR-1: exactly one WeeklyReport per Monday-starting window. Creates the
/// child rows (OutcomeMetrics/WeeklyExtras/SearchVisibilityMetrics/SignalNote x4)
/// up front so every required field is visible as an explicit blank in the UI
/// from the moment a week starts, rather than appearing only once someone
/// happens to fill something in.
export async function getOrCreateReportForWeek(weekStart: Date) {
  const existing = await prisma.weeklyReport.findUnique({
    where: { weekStartDate: weekStart },
    include: FULL_REPORT_INCLUDE,
  });
  if (existing) return existing;

  try {
    return await prisma.weeklyReport.create({
      data: {
        weekStartDate: weekStart,
        weekEndDate: weekEndOf(weekStart),
        status: "draft",
        outcomeMetrics: { create: {} },
        weeklyExtras: { create: {} },
        searchVisibility: { create: {} },
        signalNotes: { create: SIGNAL_TYPES.map((signalType) => ({ signalType })) },
      },
      include: FULL_REPORT_INCLUDE,
    });
  } catch (err) {
    // Two concurrent requests (e.g. Next.js prefetching "/" from more than one
    // nav link at once) can both see "no report yet" and race to create one —
    // the loser hits this unique constraint rather than a real error. Re-fetch
    // the winner's row instead of crashing the request.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.weeklyReport.findUnique({
        where: { weekStartDate: weekStart },
        include: FULL_REPORT_INCLUDE,
      });
      if (winner) return winner;
    }
    throw err;
  }
}

export async function getOrCreateCurrentWeekReport() {
  return getOrCreateReportForWeek(mondayOf(new Date()));
}

export async function getReportByWeekStart(weekStartIso: string) {
  const weekStart = new Date(weekStartIso);
  return prisma.weeklyReport.findUnique({ where: { weekStartDate: weekStart }, include: FULL_REPORT_INCLUDE });
}

export async function getReportById(reportId: string) {
  return prisma.weeklyReport.findUnique({ where: { id: reportId }, include: FULL_REPORT_INCLUDE });
}

/// For the /trends historical index and prior/next navigation on a report page.
export async function listReportWeeks() {
  return prisma.weeklyReport.findMany({
    select: { id: true, weekStartDate: true, weekEndDate: true, status: true },
    orderBy: { weekStartDate: "desc" },
  });
}
