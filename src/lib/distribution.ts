/// Report distribution (FR-26/27/28) — Slack chat.postMessage on publish, plus
/// a Discord-formatted text variant for the "copy as Discord text" fallback
/// (Section 6's Step 6 allows either channel). Deliberately has no email path
/// at all — FR-28 isn't a default-off flag, there's simply no function here
/// that sends one.
import { postMessage } from "@/lib/slack";
import { computeSplit } from "@/lib/data/mentionsQueries";
import type { FullReport } from "@/lib/data/reportQueries";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function naOr(value: number | string | null | undefined, naReason: string | null | undefined): string {
  if (value !== null && value !== undefined) return String(value);
  return naReason ? `N/A — ${naReason}` : "N/A";
}

function buildSummaryLines(report: FullReport, bold: (s: string) => string): string[] {
  const lines: string[] = [];
  const om = report.outcomeMetrics;
  const ex = report.weeklyExtras;
  const sv = report.searchVisibility;

  lines.push(bold(`Weekly GTM Report — ${fmtDate(report.weekStartDate)} to ${fmtDate(report.weekEndDate)}`));
  lines.push("");
  lines.push(bold("Outcome"));
  lines.push(`• New Signups: ${naOr(om?.newSignups, om?.newSignupsNaReason)}`);
  lines.push(`• Activated Users: ${naOr(om?.activatedUsers, om?.activatedUsersNaReason)}`);
  lines.push(
    `• Activation Rate: ${om?.activationRate !== null && om?.activationRate !== undefined ? `${(om.activationRate * 100).toFixed(1)}%` : "N/A"}`
  );
  lines.push(
    `• WoW Signup Growth: ${om?.wowSignupGrowthPct !== null && om?.wowSignupGrowthPct !== undefined ? `${om.wowSignupGrowthPct.toFixed(1)}%` : "N/A"}`
  );

  lines.push("");
  lines.push(bold("Channels"));
  for (const ch of report.channelMetrics) {
    lines.push(`• ${ch.utmSource}: ${naOr(ch.signups, ch.naReason)}`);
  }

  lines.push("");
  lines.push(bold("Search Visibility & Brand Mentions"));
  lines.push(`• Branded Search Impressions: ${naOr(sv?.brandedImpressions, sv?.naReason)}`);
  const split = computeSplit(report.brandMentions);
  lines.push(
    `• Paid vs Organic Mentions: ${split.paidVerifiedCount} paid / ${split.organicCount} organic${
      split.paidSharePct !== null ? ` (${split.paidSharePct.toFixed(0)}% paid / ${split.organicSharePct!.toFixed(0)}% organic)` : ""
    }`
  );

  const activeFlags = report.interventionFlags.filter((f) => f.autoDetected);
  lines.push("");
  lines.push(bold(`Intervention Triggers (${activeFlags.length})`));
  if (activeFlags.length === 0) {
    lines.push("• None this week.");
  } else {
    for (const f of activeFlags) {
      lines.push(`• ${f.description}${f.resolvedAction ? ` — Action: ${f.resolvedAction}` : " — _no action logged yet_"}`);
    }
  }

  lines.push("");
  lines.push(bold(`Decisions (${report.decisions.length})`));
  for (const d of report.decisions) {
    lines.push(`${report.decisions.indexOf(d) + 1}. ${d.text}`);
  }

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    lines.push("");
    lines.push(`Full report: ${appUrl}/reports/${fmtDate(report.weekStartDate)}`);
  }

  return lines;
}

/// Slack mrkdwn uses single asterisks for bold.
export function formatSlackSummaryText(report: FullReport): string {
  return buildSummaryLines(report, (s) => `*${s}*`).join("\n");
}

/// Discord markdown uses double asterisks for bold — otherwise identical
/// content, per FR-27's "copy as Discord-formatted text" fallback.
export function formatDiscordSummaryText(report: FullReport): string {
  return buildSummaryLines(report, (s) => `**${s}**`).join("\n");
}

export async function postPublishedReportSummary(report: FullReport): Promise<boolean> {
  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!channelId) return false;
  return postMessage(channelId, formatSlackSummaryText(report));
}
