/// Twitter/X follower count via Scrape.do — renders the profile page (bypassing
/// X's bot detection, same technique already validated live in the Content
/// Tracking Dashboard for individual tweets) and reads the `schema.org
/// ProfilePage` JSON-LD block X embeds for SEO. This is genuine structured
/// data X publishes on purpose, not reverse-engineered internal app state, so
/// it's a meaningfully more stable target than scraping the rendered DOM.
///
/// Deliberately narrow: this gives follower count (and lifetime tweet count),
/// NOT weekly engagement — there's no per-week aggregate in this block, only
/// account totals. Weekly engagement still comes from src/lib/twitterScraper.ts
/// (Apify) when that's available; the two are merged in pullMetrics.ts.
import type { PullResult } from "@/lib/posthog";

function isConfigured(): boolean {
  return Boolean(process.env.SCRAPE_DO_TOKEN);
}

export interface ScrapedProfileData {
  followerCount: number | null;
  totalTweetCount: number | null;
}

interface InteractionStatistic {
  name?: string;
  userInteractionCount?: number;
}

/// Pure extraction — independently testable without a network call. Scans
/// every JSON-LD block on the page for the one with @type "ProfilePage" (X
/// also emits WebSite and BreadcrumbList JSON-LD blocks on the same page,
/// confirmed live, so this can't assume the first block is the right one).
export function extractProfileJsonLd(html: string): ScrapedProfileData | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const obj = parsed as { ["@type"]?: string; mainEntity?: { interactionStatistic?: InteractionStatistic[] } };
    if (obj["@type"] !== "ProfilePage") continue;
    const stats = obj.mainEntity?.interactionStatistic;
    if (!Array.isArray(stats)) continue;
    const followerCount = stats.find((s) => s.name === "Follows")?.userInteractionCount ?? null;
    const totalTweetCount = stats.find((s) => s.name === "Tweets")?.userInteractionCount ?? null;
    return { followerCount, totalTweetCount };
  }
  return null;
}

async function fetchProfileHtml(handle: string): Promise<string | null> {
  if (!isConfigured()) return null;
  try {
    const targetUrl = `https://x.com/${encodeURIComponent(handle)}`;
    const proxyUrl = `https://api.scrape.do/?token=${process.env.SCRAPE_DO_TOKEN}&url=${encodeURIComponent(targetUrl)}&render=true`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchTwitterProfile(handle: string): Promise<PullResult<ScrapedProfileData>> {
  const html = await fetchProfileHtml(handle);
  if (!html) return { available: false };
  const data = extractProfileJsonLd(html);
  if (!data) return { available: false };
  return { available: true, pulledAt: new Date(), data };
}
