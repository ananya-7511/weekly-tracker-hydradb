/// CommunityMentions agency's own read-only dashboard JSON API — the same data
/// that powers their pinned Google Sheet, fetched directly with a query-string
/// token (no OAuth/service-account setup needed, unlike wiring up the Sheets
/// API directly). Confirmed live: GET {base}?token=...&start=YYYY-MM-DD&end=YYYY-MM-DD
/// returns { success, client, dateRange, posts: [...] }.
///
/// This supersedes the Slack/manual-CSV ingestion paths in practice (FR-31
/// doesn't require picking just one) — same externalId dedup convention as
/// csvParser.ts, so a mention picked up by more than one path still collapses
/// to a single BrandMention row.
import { stableHash, type ParsedMentionRow, type ParsedMentionPlatform, type ParsedMentionStatus } from "./csvParser";

function isConfigured(): boolean {
  return Boolean(process.env.COMMUNITY_MENTIONS_API_URL && process.env.COMMUNITY_MENTIONS_API_TOKEN);
}

interface RawDashboardPost {
  date?: string;
  postTitle?: string | null;
  subreddit?: string | null;
  channel?: string;
  commentText?: string | null;
  postUrl?: string | null;
  commentUrl?: string | null;
  upvotes?: number;
  status?: string;
}

interface RawDashboardResponse {
  success?: boolean;
  posts?: RawDashboardPost[];
}

const CHANNEL_TO_PLATFORM: Record<string, ParsedMentionPlatform> = {
  reddit: "reddit",
  medium: "medium",
  youtube: "youtube",
  linkedin: "linkedin",
  x: "x",
};

/// The API's own status vocabulary uses "posted" where the confirmed CSV
/// export (Section 5) uses "posting" for the same not-yet-verified state —
/// same lifecycle, different word. Mapped here rather than widening
/// ParsedMentionStatus, so every consumer keeps working off one vocabulary.
const STATUS_MAP: Record<string, ParsedMentionStatus> = {
  posted: "posting",
  verified: "verified",
  removed: "removed",
};

/// Pure mapping — independently testable. Returns null (skip, not a guess)
/// for a row with an unparseable date, an unrecognized channel, or an
/// unrecognized status, mirroring csvParser.ts's row-level error handling.
export function mapDashboardPostToRow(post: RawDashboardPost): ParsedMentionRow | null {
  const postedDate = post.date ? new Date(post.date) : null;
  if (!postedDate || Number.isNaN(postedDate.getTime())) return null;

  const platform = CHANNEL_TO_PLATFORM[post.channel?.toLowerCase().trim() ?? ""];
  if (!platform) return null;

  const status = STATUS_MAP[post.status?.toLowerCase().trim() ?? ""];
  if (!status) return null;

  const postUrl = post.postUrl || null;
  const commentUrl = post.commentUrl || null;
  const dedupSource = commentUrl || `${post.date}|${post.channel}|${postUrl}`;

  return {
    postedDate,
    platform,
    subreddit: post.subreddit || null,
    postTitle: post.postTitle || null,
    postUrl,
    commentText: post.commentText || null,
    commentUrl,
    threadUpvotes: typeof post.upvotes === "number" ? post.upvotes : null,
    status,
    externalId: `mention-${stableHash(dedupSource)}`,
  };
}

export interface DashboardApiFetchResult {
  available: boolean;
  rows: ParsedMentionRow[];
  rowsSkipped: number;
}

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/// One call per ingestion run, always re-querying a rolling window (no cursor
/// needed — the API is a plain date-range query, not an incremental feed) so
/// a row that transitions "posted" -> "verified" days later gets picked up on
/// the next poll via the same upsert-by-externalId path the CSV/Slack
/// ingestion already uses. Window length mirrors the existing
/// mentions_search_lookback_days=60 trigger default.
export async function fetchCommunityMentionsDashboard(
  lookbackDays = 60,
  now: Date = new Date()
): Promise<DashboardApiFetchResult> {
  if (!isConfigured()) return { available: false, rows: [], rowsSkipped: 0 };

  const start = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const url = `${process.env.COMMUNITY_MENTIONS_API_URL}?token=${process.env.COMMUNITY_MENTIONS_API_TOKEN}&start=${toDateParam(
    start
  )}&end=${toDateParam(now)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { available: false, rows: [], rowsSkipped: 0 };
    const data = (await res.json()) as RawDashboardResponse;
    if (!data.success || !Array.isArray(data.posts)) return { available: false, rows: [], rowsSkipped: 0 };

    const rows: ParsedMentionRow[] = [];
    let rowsSkipped = 0;
    for (const post of data.posts) {
      const row = mapDashboardPostToRow(post);
      if (row) rows.push(row);
      else rowsSkipped++;
    }
    return { available: true, rows, rowsSkipped };
  } catch {
    return { available: false, rows: [], rowsSkipped: 0 };
  }
}
