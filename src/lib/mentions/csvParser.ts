/// Parses the CommunityMentions export — the one CONFIRMED artifact from the
/// agency (Section 5 of the PRD, verified against a real 479-row export,
/// June 4–July 3, 2026): a CSV with columns
/// `Date, Channel, Subreddit, Post Title, Post URL, Comment, Comment URL, Thread Upvotes, Status`.
///
/// Pure function, no I/O — used by BOTH the Slack ingestion job
/// (ingestMentions.ts, for CSV file attachments dropped in Slack) and the manual
/// upload fallback route, per FR-31's requirement that switching ingestion paths
/// later shouldn't require a data-model or parsing-logic change.

export type ParsedMentionStatus = "verified" | "posting" | "removed";
export type ParsedMentionPlatform = "reddit" | "youtube" | "medium" | "linkedin" | "x";

export interface ParsedMentionRow {
  postedDate: Date;
  platform: ParsedMentionPlatform;
  subreddit: string | null;
  postTitle: string | null;
  postUrl: string | null;
  commentText: string | null;
  commentUrl: string | null;
  threadUpvotes: number | null;
  status: ParsedMentionStatus;
  /// Dedup key across repeated Slack polls / re-uploaded exports — the confirmed
  /// schema has no row ID, so this is derived from stable fields.
  externalId: string;
}

export interface CsvParseError {
  rowNumber: number;
  reason: string;
}

export interface CsvParseResult {
  rows: ParsedMentionRow[];
  errors: CsvParseError[];
}

const EXPECTED_HEADERS = [
  "Date",
  "Channel",
  "Subreddit",
  "Post Title",
  "Post URL",
  "Comment",
  "Comment URL",
  "Thread Upvotes",
  "Status",
];

const CHANNEL_TO_PLATFORM: Record<string, ParsedMentionPlatform> = {
  reddit: "reddit",
  medium: "medium",
  youtube: "youtube",
  linkedin: "linkedin",
  x: "x",
};

/// djb2 — a small, deterministic non-cryptographic hash, good enough for a dedup
/// key over a handful of stable fields (not a security boundary).
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/// Splits one CSV line into fields, honoring RFC4180 double-quote escaping
/// (a comment field containing a literal comma or quote is realistic here).
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function splitCsvRows(csvText: string): string[] {
  // Handles a quoted field spanning multiple physical lines (embedded newlines).
  const lines = csvText.replace(/\r\n/g, "\n").split("\n");
  const rows: string[] = [];
  let buffer = "";
  for (const line of lines) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    const quoteCount = (buffer.match(/"/g) ?? []).length;
    if (quoteCount % 2 === 0) {
      rows.push(buffer);
      buffer = "";
    }
  }
  if (buffer) rows.push(buffer);
  return rows.filter((r) => r.trim().length > 0);
}

export function parseCommunityMentionsCsv(csvText: string): CsvParseResult {
  const rows = splitCsvRows(csvText);
  const result: CsvParseResult = { rows: [], errors: [] };
  if (rows.length === 0) return result;

  const headers = splitCsvLine(rows[0]).map((h) => h.trim());
  const missingHeaders = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    result.errors.push({
      rowNumber: 1,
      reason: `Missing expected column(s): ${missingHeaders.join(", ")} — is this the CommunityMentions export format?`,
    });
    return result;
  }
  const idx = (name: string) => headers.indexOf(name);

  for (let i = 1; i < rows.length; i++) {
    const rowNumber = i + 1;
    const fields = splitCsvLine(rows[i]);
    if (fields.every((f) => f === "")) continue;

    const dateRaw = fields[idx("Date")];
    const channelRaw = fields[idx("Channel")];
    const statusRaw = fields[idx("Status")]?.toLowerCase().trim();
    const upvotesRaw = fields[idx("Thread Upvotes")];

    const postedDate = dateRaw ? new Date(dateRaw) : null;
    if (!postedDate || Number.isNaN(postedDate.getTime())) {
      result.errors.push({ rowNumber, reason: `Unparseable Date: "${dateRaw}"` });
      continue;
    }

    const platform = CHANNEL_TO_PLATFORM[channelRaw?.toLowerCase().trim() ?? ""];
    if (!platform) {
      result.errors.push({ rowNumber, reason: `Unrecognized Channel: "${channelRaw}"` });
      continue;
    }

    // Only verified/posting are observed in practice; a future `removed` value
    // is explicitly anticipated (Section 5) and kept, not silently dropped.
    if (statusRaw !== "verified" && statusRaw !== "posting" && statusRaw !== "removed") {
      result.errors.push({ rowNumber, reason: `Unrecognized Status: "${fields[idx("Status")]}"` });
      continue;
    }

    const postUrl = fields[idx("Post URL")] || null;
    const commentUrl = fields[idx("Comment URL")] || null;
    const dedupSource = commentUrl || `${dateRaw}|${channelRaw}|${postUrl}`;

    result.rows.push({
      postedDate,
      platform,
      subreddit: fields[idx("Subreddit")] || null,
      postTitle: fields[idx("Post Title")] || null,
      postUrl,
      commentText: fields[idx("Comment")] || null,
      commentUrl,
      threadUpvotes: upvotesRaw ? Number.parseInt(upvotesRaw, 10) || null : null,
      status: statusRaw,
      externalId: `mention-${stableHash(dedupSource)}`,
    });
  }

  return result;
}
