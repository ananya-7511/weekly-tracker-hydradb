/// Google Search Console (Search Analytics API) client — Layer 4 (FR-29/30).
/// Same mock-mode-until-configured pattern as src/lib/posthog.ts: returns
/// `{ available: false }` rather than a fabricated number when the service
/// account credentials or branded query term list aren't set up yet.
import { google } from "googleapis";
import type { PullResult } from "@/lib/posthog";

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL &&
      process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY &&
      process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL
  );
}

function getClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  return google.searchconsole({ version: "v1", auth });
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface QueryRow {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
}

/// Queries branded terms only (Open Question #9 — a defined list, not an ad hoc
/// filter, so the metric is reproducible week to week).
async function queryBrandedRows(
  startDate: Date,
  endDate: Date,
  brandedQueryTerms: string[]
): Promise<QueryRow[] | null> {
  try {
    const client = getClient();
    const res = await client.searchanalytics.query({
      siteUrl: process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL,
      requestBody: {
        startDate: toDateStr(startDate),
        endDate: toDateStr(endDate),
        dimensions: ["query"],
        dimensionFilterGroups: [
          {
            groupType: "or",
            filters: brandedQueryTerms.map((term) => ({
              dimension: "query",
              operator: "contains",
              expression: term,
            })),
          },
        ],
        rowLimit: 500,
      },
    });
    return (res.data.rows ?? []).map((row) => ({
      query: row.keys?.[0] ?? "",
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      position: row.position ?? 0,
    }));
  } catch {
    return null;
  }
}

export interface SearchVisibilityData {
  brandedImpressions: number;
  brandedClicks: number;
  avgPosition: number | null;
  newTop20Queries: string[];
}

/// FR-29/30 combined: branded impressions/clicks/avg position for the current
/// window, plus queries that newly crossed into the top 20 versus the prior
/// 7-day window (a page ranking there now that wasn't last week).
export async function fetchSearchVisibility(
  weekStart: Date,
  weekEnd: Date,
  priorWeekStart: Date,
  priorWeekEnd: Date,
  brandedQueryTerms: string[]
): Promise<PullResult<SearchVisibilityData>> {
  if (!isConfigured() || brandedQueryTerms.length === 0) return { available: false };

  const [currentRows, priorRows] = await Promise.all([
    queryBrandedRows(weekStart, weekEnd, brandedQueryTerms),
    queryBrandedRows(priorWeekStart, priorWeekEnd, brandedQueryTerms),
  ]);
  if (!currentRows) return { available: false };

  const brandedImpressions = currentRows.reduce((sum, r) => sum + r.impressions, 0);
  const brandedClicks = currentRows.reduce((sum, r) => sum + r.clicks, 0);
  const avgPosition =
    brandedImpressions > 0
      ? currentRows.reduce((sum, r) => sum + r.position * r.impressions, 0) / brandedImpressions
      : null;

  const currentTop20 = new Set(currentRows.filter((r) => r.position <= 20).map((r) => r.query));
  const priorTop20 = new Set((priorRows ?? []).filter((r) => r.position <= 20).map((r) => r.query));
  const newTop20Queries = [...currentTop20].filter((q) => !priorTop20.has(q));

  return {
    available: true,
    pulledAt: new Date(),
    data: { brandedImpressions, brandedClicks, avgPosition, newTop20Queries },
  };
}
