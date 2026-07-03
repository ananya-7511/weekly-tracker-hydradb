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

  // --- Outcome metrics (FR-5/6/7) ---
  const signupsResult = await posthog.fetchTotalSignups(weekStart, weekEnd, settings.signupEventName);
  if (signupsResult.available) {
    const priorOutcome = await prisma.outcomeMetrics.findFirst({
      where: { report: { weekStartDate: priorStart } },
      select: { newSignups: true },
    });
    let activatedUsers: number | null = null;
    let activatedPulledAt: Date | null = null;
    if (settings.activationEventName) {
      const activation = await posthog.fetchActivationFunnel(
        weekStart,
        weekEnd,
        settings.signupEventName,
        settings.activationEventName
      );
      if (activation.available) {
        activatedUsers = activation.data.activated;
        activatedPulledAt = activation.pulledAt;
      }
    }
    const newSignups = signupsResult.data.count;
    const wowGrowth =
      priorOutcome?.newSignups && priorOutcome.newSignups > 0
        ? ((newSignups - priorOutcome.newSignups) / priorOutcome.newSignups) * 100
        : null;

    await prisma.outcomeMetrics.upsert({
      where: { reportId },
      create: {
        reportId,
        newSignups,
        newSignupsPulledAt: signupsResult.pulledAt,
        newSignupsSource: "PostHog: Weekly Signups by Source",
        activatedUsers,
        activatedUsersPulledAt: activatedPulledAt,
        activationRate: activatedUsers !== null && newSignups > 0 ? activatedUsers / newSignups : null,
        wowSignupGrowthPct: wowGrowth,
      },
      update: {
        newSignups,
        newSignupsNaReason: null,
        newSignupsPulledAt: signupsResult.pulledAt,
        newSignupsSource: "PostHog: Weekly Signups by Source",
        ...(activatedUsers !== null
          ? { activatedUsers, activatedUsersNaReason: null, activatedUsersPulledAt: activatedPulledAt }
          : {}),
        activationRate: activatedUsers !== null && newSignups > 0 ? activatedUsers / newSignups : undefined,
        wowSignupGrowthPct: wowGrowth,
      },
    });
    summary.outcomeMetrics = "pulled";
  }

  // --- Sign-Ups by Channel (FR-9) ---
  const channelResult = await posthog.fetchSignupsByChannel(weekStart, weekEnd, settings.signupEventName);
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
