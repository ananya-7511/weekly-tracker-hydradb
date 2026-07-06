/// Thin Slack Web API wrapper for CommunityMentions ingestion (FR-31) — reads
/// the dedicated channel where the agency drops its daily CSV export. Mirrors
/// the companion Content Tracking Dashboard's raw-fetch, Bearer-token style
/// (src/lib/ingestion/slackSource.ts) rather than pulling in the full Slack SDK
/// for a handful of calls. No posting/distribution happens through this
/// project's Slack app — that channel is reserved for the agency's report.

export interface SlackFileAttachment {
  id: string;
  name: string;
  filetype: string;
  urlPrivateDownload: string;
}

export interface SlackMessage {
  ts: string;
  text: string;
  permalink: string;
  userId: string | null;
  files: SlackFileAttachment[];
}

/// Channel events (joins, topic changes) carry a `subtype`; anything posted by
/// a bot (e.g. the agency's own reporting bot re-posting a summary) carries
/// `bot_id` — excluding both avoids ingesting system/bot noise as if it were
/// the actual CSV drop, same rule as the companion app.
function isIngestibleMessage(m: { text?: string; subtype?: string; bot_id?: string }): boolean {
  return !!m.text && !m.subtype && !m.bot_id;
}

export function permalinkFor(channelId: string, ts: string): string {
  return `https://slack.com/archives/${channelId}/p${ts.replace(".", "")}`;
}

/// Returns `null` (not `[]`) when SLACK_BOT_TOKEN is unset, so callers can tell
/// "not configured" apart from "polled, nothing new" — important for mentions
/// ingestion, where "not configured" should leave the manual CSV upload as the
/// only path rather than silently no-op.
export async function fetchChannelMessages(
  channelId: string,
  oldestTs: string | null
): Promise<SlackMessage[] | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !channelId) return null;

  const params = new URLSearchParams({ channel: channelId, limit: "200" });
  if (oldestTs) params.set("oldest", oldestTs);

  const res = await fetch(`https://slack.com/api/conversations.history?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error (conversations.history): ${data.error ?? "unknown"}`);
  }

  return (data.messages ?? [])
    .filter(isIngestibleMessage)
    .map((m: { ts: string; text: string; user?: string; files?: Array<{ id: string; name: string; filetype: string; url_private_download: string }> }) => ({
      ts: m.ts,
      text: m.text,
      permalink: permalinkFor(channelId, m.ts),
      userId: m.user ?? null,
      files: (m.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        filetype: f.filetype,
        urlPrivateDownload: f.url_private_download,
      })),
    }));
}

/// Downloads a private file attachment's raw text content (the CSV export
/// attached to the agency's daily Slack message — see src/lib/mentions/ingestMentions.ts).
export async function downloadSlackFileText(urlPrivateDownload: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(urlPrivateDownload, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

