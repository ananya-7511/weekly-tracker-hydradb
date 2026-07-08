/// YouTube mentions/content relevant to HydraDB via Scrape.do's specialized
/// YouTube search plugin (a real documented search API, unlike the Apify
/// actor's unreliable docs) — reuses the same SCRAPE_DO_TOKEN as
/// scrapeDoTwitter.ts and the same brandedQueryTerms list Search Console and
/// Twitter mentions already use, rather than a separate setting.
import type { PullResult } from "@/lib/posthog";

const ENDPOINT = "https://api.scrape.do/plugin/google/youtube";

function isConfigured(): boolean {
  return Boolean(process.env.SCRAPE_DO_TOKEN);
}

interface RawVideoResult {
  video_id?: string;
  title?: string;
  link?: string;
  description?: string;
  published_date?: string;
}

export interface YoutubeMentionItem {
  externalId: string;
  postUrl: string;
  postTitle: string | null;
  commentText: string | null;
  postedDate: Date;
}

/// YouTube's search results only ever give a relative age ("4 months ago",
/// "2 weeks ago", "3 days ago") — never an absolute date. This converts that
/// to an approximate absolute date, anchored to `now`. Good enough to bucket
/// a video into roughly the right week; not exact to the day, and month/year
/// units use a fixed 30/365-day approximation rather than real calendar math.
export function parseRelativePublishedDate(text: string, now: Date): Date | null {
  const match = text.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const msPerUnit: Record<string, number> = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };
  const ms = msPerUnit[unit];
  if (!ms) return null;
  return new Date(now.getTime() - amount * ms);
}

/// Strips everything but letters/digits and lowercases, so "Hydra DB",
/// "hydra-db", and "HydraDB" all normalize to the same "hydradb" token.
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/// YouTube's own search relevance is fuzzy word-overlap, not phrase matching —
/// searching "hydra db" also surfaces an unrelated "Hydra" Postgres analytics
/// tool and unrelated songs with "Hydra" in the title. This re-checks that at
/// least one branded term literally appears (as a normalized substring) in
/// the title or description before treating a result as a real mention.
/// Exported for testing; not a guarantee against coincidental name collisions
/// (e.g. a song literally titled "Hydra DB ...") — just cuts the obvious noise.
export function isRelevantVideo(video: RawVideoResult, searchTerms: string[]): boolean {
  const haystack = normalize(`${video.title ?? ""} ${video.description ?? ""}`);
  return searchTerms.some((term) => haystack.includes(normalize(term)));
}

/// Pure mapping — independently testable. Skips a video entirely if its
/// published date can't be parsed, rather than guessing a date (same
/// "never a silently wrong number" rule the CSV parser follows) — an
/// unparseable date can't be reliably attributed to any week.
export function mapVideosToMentionItems(videos: RawVideoResult[], now: Date): YoutubeMentionItem[] {
  const items: YoutubeMentionItem[] = [];
  for (const v of videos) {
    if (!v.video_id || !v.link || !v.published_date) continue;
    const postedDate = parseRelativePublishedDate(v.published_date, now);
    if (!postedDate) continue;
    items.push({
      externalId: `youtube-mention-${v.video_id}`,
      postUrl: v.link,
      postTitle: v.title ?? null,
      commentText: v.description ?? null,
      postedDate,
    });
  }
  return items;
}

async function searchYoutube(query: string): Promise<RawVideoResult[] | null> {
  if (!isConfigured()) return null;
  try {
    const url = `${ENDPOINT}?token=${process.env.SCRAPE_DO_TOKEN}&search_query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.video_results) ? data.video_results : [];
  } catch {
    return null;
  }
}

/// One request per branded term (mirrors src/lib/searchConsole.ts's approach
/// for the same reason: no reliable OR-across-terms in a single call), merged
/// and deduped by video ID.
export async function fetchYoutubeMentions(searchTerms: string[]): Promise<PullResult<{ items: YoutubeMentionItem[] }>> {
  if (searchTerms.length === 0) return { available: false };
  const perTermResults = await Promise.all(searchTerms.map((term) => searchYoutube(term)));
  if (perTermResults.every((r) => r === null)) return { available: false };

  const byId = new Map<string, RawVideoResult>();
  for (const videos of perTermResults) {
    if (!videos) continue;
    for (const v of videos) {
      if (v.video_id && !byId.has(v.video_id)) byId.set(v.video_id, v);
    }
  }

  const relevant = [...byId.values()].filter((v) => isRelevantVideo(v, searchTerms));
  const now = new Date();
  return { available: true, pulledAt: now, data: { items: mapVideosToMentionItems(relevant, now) } };
}
