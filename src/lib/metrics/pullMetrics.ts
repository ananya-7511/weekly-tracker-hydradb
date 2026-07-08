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
import { fetchTwitterAccountHealth, fetchTwitterMentions } from "@/lib/twitterScraper";
import { fetchTwitterProfile } from "@/lib/scrapeDoTwitter";
import { fetchGuildMemberCount } from "@/lib/discordApi";

export interface PullSummary {
  outcomeMetrics: "pulled" | "unavailable";
  channelMetrics: "pulled" | "unavailable";
  blogOrganicSessions: "pulled" | "unavailable";
  searchVisibility: "pulled" | "unavailable";
  twitterAccountHealth: "pulled" | "unavailable";
  twitterMentions: "pulled" | "unavailable";
  discordMembers: "pulled" | "unavailable";
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
    twitterAccountHealth: "unavailable",
    twitterMentions: "unavailable",
    discordMembers: "unavailable",
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

  // --- Twitter account health: follower count (via Scrape.do — reads the
  // schema.org ProfilePage JSON-LD block X publishes on its own profile pages,
  // confirmed live), weekly engagement + top tweet (via Apify, when that's
  // available). Impressions/views aren't exposed by either, native Twitter
  // Analytics is the only source, so that field stays manual regardless.
  // Either source can be down independently — each falls back to the last
  // known value rather than regressing to blank.
  const [profileResult, accountHealthResult] = await Promise.all([
    fetchTwitterProfile(settings.twitterHandle),
    fetchTwitterAccountHealth(weekStart, weekEnd, settings.twitterHandle),
  ]);
  if (profileResult.available || accountHealthResult.available) {
    const existingExtras = await prisma.weeklyExtras.findUnique({ where: { reportId } });
    const followerCount = profileResult.available
      ? profileResult.data.followerCount
      : accountHealthResult.available
        ? accountHealthResult.data.followerCount
        : (existingExtras?.twitterFollowerCount ?? null);
    const engagement = accountHealthResult.available ? accountHealthResult.data.engagement : (existingExtras?.twitterEngagement ?? null);
    const pulledAt = profileResult.available ? profileResult.pulledAt : accountHealthResult.available ? accountHealthResult.pulledAt : new Date();

    await prisma.weeklyExtras.upsert({
      where: { reportId },
      create: {
        reportId,
        twitterFollowerCount: followerCount,
        twitterEngagement: engagement,
        twitterMetricsPulledAt: pulledAt,
        ...(accountHealthResult.available && accountHealthResult.data.topTweetUrl ? { topTweetUrl: accountHealthResult.data.topTweetUrl } : {}),
      },
      update: {
        twitterFollowerCount: followerCount,
        twitterEngagement: engagement,
        twitterMetricsNaReason: null,
        twitterMetricsPulledAt: pulledAt,
        ...(accountHealthResult.available && accountHealthResult.data.topTweetUrl ? { topTweetUrl: accountHealthResult.data.topTweetUrl } : {}),
      },
    });
    summary.twitterAccountHealth = "pulled";
  }

  // --- General Twitter mentions of HydraDB — feeds the same organic
  // brand_mentions log Layer 3's manual entries use, tagged so it's clear
  // these came from the scraper rather than someone spotting one by hand.
  const mentionsResult = await fetchTwitterMentions(weekStart, weekEnd, settings.brandedQueryTerms);
  if (mentionsResult.available) {
    for (const item of mentionsResult.data.items) {
      await prisma.brandMention.upsert({
        where: { externalId: item.externalId },
        create: {
          reportId,
          mentionSource: "organic",
          platform: "x",
          postUrl: item.postUrl,
          commentUrl: item.postUrl,
          commentText: item.commentText,
          postedDate: item.postedDate,
          sourceMethod: "api_scraper",
          externalId: item.externalId,
        },
        update: {
          commentText: item.commentText,
        },
      });
    }
    summary.twitterMentions = "pulled";
  }

  // --- Discord total members (real API) + "new members" net-change
  // approximation (this week's total minus last week's — see discordApi.ts
  // for why a true join count isn't possible without an always-on bot).
  const memberResult = await fetchGuildMemberCount(settings.discordGuildId);
  if (memberResult.available) {
    const priorExtras = await prisma.weeklyExtras.findFirst({
      where: { report: { weekStartDate: priorStart } },
      select: { discordTotalMembers: true },
    });
    const newMembers =
      priorExtras?.discordTotalMembers != null ? memberResult.data.totalMembers - priorExtras.discordTotalMembers : null;

    await prisma.weeklyExtras.upsert({
      where: { reportId },
      create: {
        reportId,
        discordTotalMembers: memberResult.data.totalMembers,
        discordNewMembers: newMembers,
        discordNewMembersNaReason: newMembers === null ? "N/A — no prior week's total to compare against yet" : null,
        discordNewMembersPulledAt: memberResult.pulledAt,
      },
      update: {
        discordTotalMembers: memberResult.data.totalMembers,
        discordTotalMembersNaReason: null,
        discordNewMembers: newMembers,
        discordNewMembersNaReason: newMembers === null ? "N/A — no prior week's total to compare against yet" : null,
        discordNewMembersPulledAt: memberResult.pulledAt,
      },
    });
    summary.discordMembers = "pulled";
  }

  return summary;
}
