"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { pullAllAutomatedMetrics } from "@/lib/metrics/pullMetrics";
import { evaluateTriggersForReport } from "@/lib/triggers/runner";

function numOrNull(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function strOrNull(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

function revalidateReport(weekStartIso: string) {
  revalidatePath(`/reports/${weekStartIso}`);
  revalidatePath("/");
  revalidatePath("/trends");
}

export async function pullMetricsAction(reportId: string, weekStartIso: string) {
  await pullAllAutomatedMetrics(reportId);
  await evaluateTriggersForReport(reportId);
  revalidateReport(weekStartIso);
}

export async function saveOutcomeMetrics(reportId: string, weekStartIso: string, formData: FormData) {
  const newSignups = numOrNull(formData, "newSignups");
  const newSignupsNaReason = strOrNull(formData, "newSignupsNaReason");
  const totalUniqueVisitors = numOrNull(formData, "totalUniqueVisitors");
  const totalUniqueVisitorsNaReason = strOrNull(formData, "totalUniqueVisitorsNaReason");

  await prisma.outcomeMetrics.update({
    where: { reportId },
    data: {
      newSignups,
      newSignupsNaReason: newSignups === null ? newSignupsNaReason : null,
      totalUniqueVisitors,
      totalUniqueVisitorsNaReason: totalUniqueVisitors === null ? totalUniqueVisitorsNaReason : null,
      primaryConversionRatePct: newSignups !== null && totalUniqueVisitors ? (newSignups / totalUniqueVisitors) * 100 : null,
    },
  });
  await evaluateTriggersForReport(reportId);
  revalidateReport(weekStartIso);
}

export async function saveChannelMetric(reportId: string, weekStartIso: string, utmSource: string, formData: FormData) {
  const signups = numOrNull(formData, `signups-${utmSource}`);
  const naReason = strOrNull(formData, `naReason-${utmSource}`);
  await prisma.channelMetrics.update({
    where: { reportId_utmSource: { reportId, utmSource } },
    data: { signups, naReason: signups === null ? naReason : null },
  });
  await evaluateTriggersForReport(reportId);
  revalidateReport(weekStartIso);
}

export async function saveWeeklyExtras(reportId: string, weekStartIso: string, formData: FormData) {
  const twitterFollowerCount = numOrNull(formData, "twitterFollowerCount");
  const twitterImpressions = numOrNull(formData, "twitterImpressions");
  const twitterEngagement = numOrNull(formData, "twitterEngagement");
  const blogSessions = numOrNull(formData, "blogOrganicSessions");
  const discordActive = numOrNull(formData, "discordActiveMembers");
  const discordTotal = numOrNull(formData, "discordTotalMembers");
  const discordNewMembers = numOrNull(formData, "discordNewMembers");

  await prisma.weeklyExtras.update({
    where: { reportId },
    data: {
      topDevrelContentFreetext: strOrNull(formData, "topDevrelContentFreetext"),
      topDevrelContentUrl: strOrNull(formData, "topDevrelContentUrl"),
      topDevrelContentNaReason:
        strOrNull(formData, "topDevrelContentFreetext") === null ? strOrNull(formData, "topDevrelContentNaReason") : null,
      twitterFollowerCount,
      twitterEngagement,
      twitterMetricsNaReason:
        twitterFollowerCount === null && twitterEngagement === null ? strOrNull(formData, "twitterMetricsNaReason") : null,
      twitterImpressions,
      twitterImpressionsNaReason: twitterImpressions === null ? strOrNull(formData, "twitterImpressionsNaReason") : null,
      topTweetUrl: strOrNull(formData, "topTweetUrl"),
      blogOrganicSessions: blogSessions,
      blogOrganicSessionsNaReason: blogSessions === null ? strOrNull(formData, "blogOrganicSessionsNaReason") : null,
      discordActiveMembers: discordActive,
      discordActiveMembersNaReason: discordActive === null ? strOrNull(formData, "discordActiveMembersNaReason") : null,
      discordTotalMembers: discordTotal,
      discordTotalMembersNaReason: discordTotal === null ? strOrNull(formData, "discordTotalMembersNaReason") : null,
      discordNewMembers,
      discordNewMembersNaReason: discordNewMembers === null ? strOrNull(formData, "discordNewMembersNaReason") : null,
    },
  });
  revalidateReport(weekStartIso);
}

export async function saveSearchVisibility(reportId: string, weekStartIso: string, formData: FormData) {
  const brandedImpressions = numOrNull(formData, "brandedImpressions");
  const brandedClicks = numOrNull(formData, "brandedClicks");
  const avgPosition = numOrNull(formData, "avgPosition");
  await prisma.searchVisibilityMetrics.update({
    where: { reportId },
    data: {
      brandedImpressions,
      brandedClicks,
      avgPosition,
      naReason: brandedImpressions === null ? strOrNull(formData, "naReason") : null,
    },
  });
  revalidateReport(weekStartIso);
}

export async function resolveFlag(flagId: string, weekStartIso: string, formData: FormData) {
  const resolvedAction = strOrNull(formData, "resolvedAction");
  await prisma.interventionFlag.update({ where: { id: flagId }, data: { resolvedAction } });
  revalidateReport(weekStartIso);
}
