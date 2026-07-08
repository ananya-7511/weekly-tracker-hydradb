/// CommunityMentions ingestion (FR-31) — Slack is the Phase 1 path: the agency's
/// daily verification report is expected to land in a configured Slack channel
/// with the CSV export attached. ASSUMPTION, flagged per the PRD's own Open
/// Question #8 (the real message format from the agency is unconfirmed as of
/// writing): this looks for a `.csv` file attachment on any message in that
/// channel, not a specific message format — the one thing that IS confirmed is
/// the CSV column schema itself (src/lib/mentions/csvParser.ts). Revisit this
/// once a real agency message is observed. The manual upload page
/// (src/app/mentions/upload/) uses the exact same parser as a fallback that
/// works regardless of what the agency's Slack message ends up looking like.
import { prisma } from "@/lib/prisma";
import { fetchChannelMessages, downloadSlackFileText } from "@/lib/slack";
import { parseCommunityMentionsCsv, type CsvParseError, type ParsedMentionRow } from "./csvParser";
import { fetchCommunityMentionsDashboard } from "./dashboardApi";
import type { Prisma, MentionSourceMethod } from "@prisma/client";

export interface MentionsIngestionSummary {
  configured: boolean;
  messagesScanned: number;
  csvFilesProcessed: number;
  rowsIngested: number;
  rowsSkipped: number;
  parseErrors: Array<CsvParseError & { fileName: string }>;
}

async function findReportForDate(date: Date) {
  return prisma.weeklyReport.findFirst({
    where: { weekStartDate: { lte: date }, weekEndDate: { gte: date } },
  });
}

export async function upsertMentionRow(row: ParsedMentionRow, sourceMethod: MentionSourceMethod) {
  const report = await findReportForDate(row.postedDate);
  const data: Prisma.BrandMentionUncheckedCreateInput = {
    reportId: report?.id ?? null,
    mentionSource: "paid",
    platform: row.platform,
    subreddit: row.subreddit,
    postTitle: row.postTitle,
    postUrl: row.postUrl,
    commentText: row.commentText,
    commentUrl: row.commentUrl,
    status: row.status,
    threadUpvotes: row.threadUpvotes,
    postedDate: row.postedDate,
    sourceMethod,
    externalId: row.externalId,
  };
  await prisma.brandMention.upsert({
    where: { externalId: row.externalId },
    create: data,
    // `status` can transition posting -> verified on a later pull (Section 5) —
    // re-ingesting the same row is expected, not an error.
    update: { status: row.status, threadUpvotes: row.threadUpvotes, reportId: report?.id ?? undefined },
  });
}

export async function ingestMentionsFromSlack(): Promise<MentionsIngestionSummary> {
  const channelId = process.env.SLACK_MENTIONS_CHANNEL_ID;
  const summary: MentionsIngestionSummary = {
    configured: Boolean(channelId),
    messagesScanned: 0,
    csvFilesProcessed: 0,
    rowsIngested: 0,
    rowsSkipped: 0,
    parseErrors: [],
  };
  if (!channelId) return summary;

  const cursor = await prisma.mentionsIngestionCursor.findUnique({ where: { id: "singleton" } });
  const messages = await fetchChannelMessages(channelId, cursor?.lastSyncedTs ?? null);
  if (!messages) return summary;
  summary.messagesScanned = messages.length;

  let latestTs = cursor?.lastSyncedTs ?? null;
  for (const message of messages) {
    if (!latestTs || Number(message.ts) > Number(latestTs)) latestTs = message.ts;

    const csvFiles = message.files.filter(
      (f) => f.filetype === "csv" || f.name.toLowerCase().endsWith(".csv")
    );
    for (const file of csvFiles) {
      const text = await downloadSlackFileText(file.urlPrivateDownload);
      if (!text) continue;
      summary.csvFilesProcessed++;
      const { rows, errors } = parseCommunityMentionsCsv(text);
      errors.forEach((e) => summary.parseErrors.push({ ...e, fileName: file.name }));

      for (const row of rows) {
        try {
          await upsertMentionRow(row, "slack_ingest");
          summary.rowsIngested++;
        } catch {
          summary.rowsSkipped++;
        }
      }
    }
  }

  await prisma.mentionsIngestionCursor.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", lastSyncedTs: latestTs },
    update: { lastSyncedTs: latestTs },
  });

  return summary;
}

export interface CsvUploadSummary {
  rowsIngested: number;
  rowsSkipped: number;
  errors: CsvParseError[];
}

/// The manual fallback (FR-31c) — same parser, same upsert logic, different
/// entry point. Used by src/app/mentions/upload/actions.ts.
export async function ingestMentionsFromCsvText(csvText: string): Promise<CsvUploadSummary> {
  const { rows, errors } = parseCommunityMentionsCsv(csvText);
  let rowsIngested = 0;
  let rowsSkipped = 0;
  for (const row of rows) {
    try {
      await upsertMentionRow(row, "manual_csv");
      rowsIngested++;
    } catch {
      rowsSkipped++;
    }
  }
  return { rowsIngested, rowsSkipped, errors };
}

export interface DashboardApiIngestSummary {
  configured: boolean;
  rowsFetched: number;
  rowsIngested: number;
  rowsSkippedOnFetch: number;
  rowsSkippedOnUpsert: number;
}

/// The CommunityMentions agency's read-only dashboard API (src/lib/mentions/dashboardApi.ts)
/// — no cursor needed, since it's a plain date-range query rather than an
/// incremental feed; re-upserting the same rolling window on every run is how
/// a status transitioning "posted" -> "verified" days later gets picked up.
/// Coexists with Slack/manual-CSV ingestion (FR-31) via the shared externalId
/// dedup convention.
export async function ingestMentionsFromDashboardApi(): Promise<DashboardApiIngestSummary> {
  const { available, rows, rowsSkipped } = await fetchCommunityMentionsDashboard();
  const summary: DashboardApiIngestSummary = {
    configured: available,
    rowsFetched: rows.length,
    rowsIngested: 0,
    rowsSkippedOnFetch: rowsSkipped,
    rowsSkippedOnUpsert: 0,
  };
  if (!available) return summary;

  for (const row of rows) {
    try {
      await upsertMentionRow(row, "dashboard_api");
      summary.rowsIngested++;
    } catch {
      summary.rowsSkippedOnUpsert++;
    }
  }
  return summary;
}
