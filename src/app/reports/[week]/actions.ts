"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { pullAllAutomatedMetrics } from "@/lib/metrics/pullMetrics";
import { evaluateTriggersForReport } from "@/lib/triggers/runner";
import { canMoveToReadyForDecisions, canPublish } from "@/lib/reportLifecycle";
import { getReportById } from "@/lib/data/reportQueries";
import { postPublishedReportSummary } from "@/lib/distribution";
import type { SignalType } from "@prisma/client";

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
  const activatedUsers = numOrNull(formData, "activatedUsers");
  const activatedUsersNaReason = strOrNull(formData, "activatedUsersNaReason");

  await prisma.outcomeMetrics.update({
    where: { reportId },
    data: {
      newSignups,
      newSignupsNaReason: newSignups === null ? newSignupsNaReason : null,
      activatedUsers,
      activatedUsersNaReason: activatedUsers === null ? activatedUsersNaReason : null,
      activationRate: newSignups && activatedUsers !== null ? activatedUsers / newSignups : null,
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
  const twitterOrganic = numOrNull(formData, "twitterImpressionsOrganic");
  const twitterInfluencer = numOrNull(formData, "twitterImpressionsInfluencer");
  const blogSessions = numOrNull(formData, "blogOrganicSessions");
  const discordActive = numOrNull(formData, "discordActiveMembers");
  const discordTotal = numOrNull(formData, "discordTotalMembers");

  await prisma.weeklyExtras.update({
    where: { reportId },
    data: {
      topDevrelContentFreetext: strOrNull(formData, "topDevrelContentFreetext"),
      topDevrelContentUrl: strOrNull(formData, "topDevrelContentUrl"),
      topDevrelContentNaReason:
        strOrNull(formData, "topDevrelContentFreetext") === null ? strOrNull(formData, "topDevrelContentNaReason") : null,
      twitterImpressionsOrganic: twitterOrganic,
      twitterImpressionsInfluencer: twitterInfluencer,
      twitterImpressionsNaReason:
        twitterOrganic === null && twitterInfluencer === null ? strOrNull(formData, "twitterImpressionsNaReason") : null,
      topTweetUrl: strOrNull(formData, "topTweetUrl"),
      blogOrganicSessions: blogSessions,
      blogOrganicSessionsNaReason: blogSessions === null ? strOrNull(formData, "blogOrganicSessionsNaReason") : null,
      discordActiveMembers: discordActive,
      discordTotalMembers: discordTotal,
      discordNaReason: discordActive === null && discordTotal === null ? strOrNull(formData, "discordNaReason") : null,
    },
  });
  revalidateReport(weekStartIso);
}

export async function saveSignalNote(reportId: string, weekStartIso: string, signalType: SignalType, formData: FormData) {
  const note = strOrNull(formData, `note-${signalType}`);
  const value = numOrNull(formData, `value-${signalType}`);
  const naReason = strOrNull(formData, `naReason-${signalType}`);
  const needsFollowup = formData.get(`needsFollowup-${signalType}`) === "on";

  await prisma.signalNote.updateMany({
    where: { reportId, signalType },
    data: {
      note,
      value,
      naReason: note === null && value === null ? naReason : null,
      needsFollowup,
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

export async function addDecision(reportId: string, weekStartIso: string, formData: FormData) {
  const text = strOrNull(formData, "text");
  if (!text) return;
  await prisma.decision.create({
    data: {
      reportId,
      text,
      isSpecific: formData.get("isSpecific") === "on",
      isTimeBound: formData.get("isTimeBound") === "on",
      isFalsifiable: formData.get("isFalsifiable") === "on",
    },
  });
  revalidateReport(weekStartIso);
}

export async function updateDecisionChecks(decisionId: string, weekStartIso: string, formData: FormData) {
  await prisma.decision.update({
    where: { id: decisionId },
    data: {
      isSpecific: formData.get("isSpecific") === "on",
      isTimeBound: formData.get("isTimeBound") === "on",
      isFalsifiable: formData.get("isFalsifiable") === "on",
    },
  });
  revalidateReport(weekStartIso);
}

export async function deleteDecision(decisionId: string, weekStartIso: string) {
  await prisma.decision.delete({ where: { id: decisionId } });
  revalidateReport(weekStartIso);
}

export async function resolveFlag(flagId: string, weekStartIso: string, formData: FormData) {
  const resolvedAction = strOrNull(formData, "resolvedAction");
  await prisma.interventionFlag.update({ where: { id: flagId }, data: { resolvedAction } });
  revalidateReport(weekStartIso);
}

/// Both transition actions re-validate server-side (the button that submits
/// them is already disabled client-side when the same check fails — this is
/// defense in depth, not the primary UX). They return void rather than a
/// result object: this project pins React 18.3.1 (matching the companion
/// app), which has no useActionState/useFormState to surface a return value
/// from a plain <form action={...}> — the page re-renders with fresh data
/// either way, and an ineligible transition is a silent no-op.
export async function transitionToReadyForDecisions(reportId: string, weekStartIso: string): Promise<void> {
  const report = await getReportById(reportId);
  if (!report) return;
  const check = canMoveToReadyForDecisions(report);
  if (!check.ok) return;
  await prisma.weeklyReport.update({ where: { id: reportId }, data: { status: "ready_for_decisions" } });
  revalidateReport(weekStartIso);
}

export async function publishReport(reportId: string, weekStartIso: string): Promise<void> {
  const report = await getReportById(reportId);
  if (!report) return;
  const check = canPublish(report.decisions);
  if (!check.ok) return;
  await prisma.weeklyReport.update({
    where: { id: reportId },
    data: { status: "published", publishedAt: new Date() },
  });
  const refreshed = await getReportById(reportId);
  if (refreshed) await postPublishedReportSummary(refreshed);
  revalidateReport(weekStartIso);
}
