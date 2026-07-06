/// Twitter/X account health + brand mentions via the Apify "apidojo/tweet-scraper"
/// actor — no login/cookie required, unlike some Twitter scrapers (confirmed via
/// its own docs: search works unauthenticated). Same mock-mode-until-configured
/// pattern as src/lib/posthog.ts: returns `{ available: false }` rather than a
/// fabricated number when APIFY_API_TOKEN is unset or the call fails.
///
/// NOTE: this actor's output has no view/impression count field (confirmed via
/// its input/output schema) — "Twitter Impressions" stays a manual field for the
/// same reason the Content Tracking Dashboard's README already documents: only
/// native Twitter Analytics (login-only) exposes that number.
import type { PullResult } from "@/lib/posthog";

const ACTOR_ENDPOINT = "https://api.apify.com/v2/actors/apidojo~tweet-scraper/run-sync-get-dataset-items";

function isConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN);
}

interface RawTweetAuthor {
  userName?: string;
  followers?: number;
}

interface RawTweet {
  id: string;
  url: string;
  text: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  bookmarkCount?: number;
  createdAt: string;
  author?: RawTweetAuthor;
}

/// Confirmed live: when a query genuinely matches nothing, the actor's dataset
/// contains sentinel `{ noResults: true }` rows instead of an empty array —
/// filtered out here so callers only ever see well-formed tweets, never a row
/// with undefined id/url/createdAt masquerading as a real (if empty) tweet.
function isRealTweet(item: unknown): item is RawTweet {
  return Boolean(item && typeof item === "object" && "id" in item && typeof (item as RawTweet).id === "string");
}

async function runActor(input: Record<string, unknown>): Promise<RawTweet[] | null> {
  if (!isConfigured()) return null;
  try {
    const res = await fetch(`${ACTOR_ENDPOINT}?token=${process.env.APIFY_API_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data.filter(isRealTweet) : null;
  } catch {
    return null;
  }
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface AccountHealthData {
  followerCount: number | null;
  engagement: number;
  topTweetUrl: string | null;
}

/// Pure aggregation over the actor's raw tweet list — independently testable
/// without a network call. Engagement = likes + retweets + replies + quotes +
/// bookmarks, summed across the account's own tweets in the window.
export function aggregateAccountHealth(tweets: RawTweet[]): AccountHealthData {
  if (tweets.length === 0) return { followerCount: null, engagement: 0, topTweetUrl: null };

  let engagement = 0;
  let topTweet: RawTweet | null = null;
  let topScore = -1;
  let followerCount: number | null = null;

  for (const t of tweets) {
    const score = (t.likeCount ?? 0) + (t.retweetCount ?? 0) + (t.replyCount ?? 0) + (t.quoteCount ?? 0) + (t.bookmarkCount ?? 0);
    engagement += score;
    if (score > topScore) {
      topScore = score;
      topTweet = t;
    }
    if (followerCount === null && typeof t.author?.followers === "number") {
      followerCount = t.author.followers;
    }
  }

  return { followerCount, engagement, topTweetUrl: topTweet?.url ?? null };
}

/// Account health (follower count, weekly engagement, top tweet) for the
/// configured handle — the account's own tweets in the report window.
export async function fetchTwitterAccountHealth(
  weekStart: Date,
  weekEnd: Date,
  handle: string
): Promise<PullResult<AccountHealthData>> {
  const tweets = await runActor({
    twitterHandles: [handle],
    start: toDateOnly(weekStart),
    end: toDateOnly(weekEnd),
    sort: "Latest",
    maxItems: 100,
  });
  if (!tweets) return { available: false };
  return { available: true, pulledAt: new Date(), data: aggregateAccountHealth(tweets) };
}

export interface TwitterMentionItem {
  externalId: string;
  postUrl: string;
  commentText: string;
  postedDate: Date;
}

/// Pure mapping — independently testable.
export function mapMentionsToItems(tweets: RawTweet[]): TwitterMentionItem[] {
  return tweets.map((t) => ({
    externalId: `twitter-mention-${t.id}`,
    postUrl: t.url,
    commentText: t.text,
    postedDate: new Date(t.createdAt),
  }));
}

/// General unprompted mentions of HydraDB across Twitter (not just replies to
/// our own account) — reuses the same brandedQueryTerms list Search Console
/// filtering uses, rather than a separate search-term setting.
export async function fetchTwitterMentions(
  weekStart: Date,
  weekEnd: Date,
  searchTerms: string[]
): Promise<PullResult<{ items: TwitterMentionItem[] }>> {
  if (searchTerms.length === 0) return { available: false };
  const tweets = await runActor({
    searchTerms,
    start: toDateOnly(weekStart),
    end: toDateOnly(weekEnd),
    sort: "Latest",
    maxItems: 50,
  });
  if (!tweets) return { available: false };
  return { available: true, pulledAt: new Date(), data: { items: mapMentionsToItems(tweets) } };
}
