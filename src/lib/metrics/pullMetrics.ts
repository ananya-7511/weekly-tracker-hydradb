/// "Pull latest" — the on-demand refresh behind FR-5/6/7/9/12/29/30, callable
/// both from a Server Action button and the weekly cron. Every write stamps
/// `pulledAt` + a `source` label (NFR auditability) and leaves the field's
/// value untouched (falls back to N/A messaging in the UI) when the upstream
/// integration isn't configured yet — never fabricates a number.
import { prisma } from "@/lib/prisma";
import { weekEndOf, priorWeekStart } from "@/lib/dateWindow";
import { getAppSettings } from "@/lib/settings";
import * as posthog from "@/lib/posthog";
import { fetchSearchVisibility } from "@/lib/searchConsole";

export interface PullSummary {
  outcomeMetrics: "pulled" | "unavailable";
  channelMetrics: "pulled" | "unavailable";
  blogOrganicSessions: "pulled" | "unavailable";
  searchVisibility: "pulled" | "unavailable";
}

/// Known channels are whatever utm_source values have ever been tracked —
/// used so a channel that drops to zero this week gets an explicit `0` row
/// instead of silently disappearing, which is what the zero-streak trigger
/// (Section 9.4) needs to detect a pause-worthy channel.
async function getKnownChannels(): Promise<Set<string>> {
  const rows = await prisma.channelMetrics.findMany({ distinct: ["utmSource"], select: { utmSource: true } });
  return new Set(rows.map((r) => r.utmSource));
}

export async function pullAllAutomatedMetrics(reportId: string): Promise<PullSummary> {
  const report = await prisma.weeklyReport.findUniqueOrThrow({ where: { id: reportId } });
  const weekStart = report.weekStartDate;
  const weekEnd = weekEndOf(weekStart);
  const priorStart = priorWeekStart(weekStart);
  const priorEnd = weekEndOf(priorStart);

  const settings = await getAppSettings();
  const summary: PullSummary = {
    outcomeMetrics: "unavailable",
    channelMetrics: "unavailable",
    blogOrganicSessions: "unavailable",
    searchVisibility: "unavailable",
  };

  // --- Outcome metrics (FR-5/7): New Signups (pageview at the signup page path),
  // Total Unique Website Visitors, and the Primary Conversion Rate computed from
  // them ("out of total unique visitors this week, how many completed sign up").
  const signupsResult = await posthog.fetchTotalSignups(weekStart, weekEnd, settings.signupPagePath);
  const visitorsResult = await posthog.fetchTotalUniqueVisitors(weekStart, weekEnd);
  if (signupsResult.available || visitorsResult.available) {
    const existingOutcome = await prisma.outcomeMetrics.findUnique({ where: { reportId } });
    const newSignups = signupsResult.available ? signupsResult.data.count : existingOutcome?.newSignups ?? null;
    const totalUniqueVisitors = visitorsResult.available
      ? visitorsResult.data.count
      : existingOutcome?.totalUniqueVisitors ?? null;

    const priorOutcome = await prisma.outcomeMetrics.findFirst({
      where: { report: { weekStartDate: priorStart } },
      select: { newSignups: true },
    });
    const wowGrowth =
      newSignups !== null && priorOutcome?.newSignups && priorOutcome.newSignups > 0
        ? ((newSignups - priorOutcome.newSignups) / priorOutcome.newSignups) * 100
        : null;
    const primaryConversionRatePct =
      newSignups !== null && totalUniqueVisitors && totalUniqueVisitors > 0
        ? (newSignups / totalUniqueVisitors) * 100
        : null;

    await prisma.outcomeMetrics.upsert({
      where: { reportId },
      create: {
        reportId,
        ...(signupsResult.available
          ? { newSignups: signupsResult.data.count, newSignupsPulledAt: signupsResult.pulledAt, newSignupsSource: "PostHog: sign-up page visits" }
          : {}),
        ...(visitorsResult.available
          ? { totalUniqueVisitors: visitorsResult.data.count, totalUniqueVisitorsPulledAt: visitorsResult.pulledAt }
          : {}),
        primaryConversionRatePct,
        wowSignupGrowthPct: wowGrowth,
      },
      update: {
        ...(signupsResult.available
          ? {
              newSignups: signupsResult.data.count,
              newSignupsNaReason: null,
              newSignupsPulledAt: signupsResult.pulledAt,
              newSignupsSource: "PostHog: sign-up page visits",
            }
          : {}),
        ...(visitorsResult.available
          ? {
              totalUniqueVisitors: visitorsResult.data.count,
              totalUniqueVisitorsNaReason: null,
              totalUniqueVisitorsPulledAt: visitorsResult.pulledAt,
            }
          : {}),
        primaryConversionRatePct,
        wowSignupGrowthPct: wowGrowth,
      },
    });
    summary.outcomeMetrics = "pulled";
  }

  // --- Sign-Ups by Channel (FR-9) ---
  const channelResult = await posthog.fetchSignupsByChannel(weekStart, weekEnd, settings.signupPagePath);
  if (channelResult.available) {
    const knownChannels = await getKnownChannels();
    const pulled = new Map(channelResult.data.bySource.map((c) => [c.utmSource, c.signups]));
    const allChannels = new Set([...knownChannels, ...pulled.keys()]);
    for (const utmSource of allChannels) {
      const signups = pulled.get(utmSource) ?? 0;
      await prisma.channelMetrics.upsert({
        where: { reportId_utmSource: { reportId, utmSource } },
        create: { reportId, utmSource, signups, pulledAt: channelResult.pulledAt },
        update: { signups, naReason: null, pulledAt: channelResult.pulledAt },
      });
    }
    summary.channelMetrics = "pulled";
  }

  // --- Blog Organic Sessions (FR-12) ---
  const blogResult = await posthog.fetchBlogOrganicSessions(weekStart, weekEnd);
  if (blogResult.available) {
    await prisma.weeklyExtras.upsert({
      where: { reportId },
      create: {
        reportId,
        blogOrganicSessions: blogResult.data.sessions,
        blogOrganicSessionsPulledAt: blogResult.pulledAt,
        blogOrganicSessionsSource: "PostHog: Blog Organic Sessions",
      },
      update: {
        blogOrganicSessions: blogResult.data.sessions,
        blogOrganicSessionsNaReason: null,
        blogOrganicSessionsPulledAt: blogResult.pulledAt,
        blogOrganicSessionsSource: "PostHog: Blog Organic Sessions",
      },
    });
    summary.blogOrganicSessions = "pulled";
  }

  // --- Search Visibility (FR-29/30) ---
  const searchResult = await fetchSearchVisibility(weekStart, weekEnd, priorStart, priorEnd, settings.brandedQueryTerms);
  if (searchResult.available) {
    await prisma.searchVisibilityMetrics.upsert({
      where: { reportId },
      create: {
        reportId,
        brandedImpressions: searchResult.data.brandedImpressions,
        brandedClicks: searchResult.data.brandedClicks,
        avgPosition: searchResult.data.avgPosition,
        newTop20Queries: searchResult.data.newTop20Queries,
        pulledAt: searchResult.pulledAt,
      },
      update: {
        brandedImpressions: searchResult.data.brandedImpressions,
        brandedClicks: searchResult.data.brandedClicks,
        avgPosition: searchResult.data.avgPosition,
        newTop20Queries: searchResult.data.newTop20Queries,
        naReason: null,
        pulledAt: searchResult.pulledAt,
      },
    });
    summary.searchVisibility = "pulled";
  }

  return summary;
}
