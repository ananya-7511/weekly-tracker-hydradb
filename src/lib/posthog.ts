/// PostHog HogQL Query API client (Section 9.5). Every exported function returns
/// `{ available: false }` instead of throwing or faking a number when the
/// credentials are unset or the API call fails — the same mock-mode-until-configured
/// pattern used throughout the Content Tracking Dashboard's enrichers, so a missing
/// credential never silently shows a wrong number, it shows "not available."

function isConfigured() {
  return Boolean(process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID);
}

function escapeHogQLString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function runHogQL(query: string): Promise<{ columns: string[]; results: unknown[][] } | null> {
  if (!isConfigured()) return null;
  const host = process.env.POSTHOG_HOST || "https://us.posthog.com";
  const projectId = process.env.POSTHOG_PROJECT_ID;
  try {
    const res = await fetch(`${host}/api/projects/${projectId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.POSTHOG_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { columns: data.columns ?? [], results: data.results ?? [] };
  } catch {
    return null;
  }
}

function isoRange(weekStart: Date, weekEnd: Date) {
  return { from: weekStart.toISOString(), to: weekEnd.toISOString() };
}

export interface AvailableResult<T> {
  available: true;
  pulledAt: Date;
  data: T;
}
export interface UnavailableResult {
  available: false;
}
export type PullResult<T> = AvailableResult<T> | UnavailableResult;

/// Sign-Ups by Channel (FR-9) — grouped by the *initial* UTM source person property,
/// per Section 9.2: initial attribution is the channel that brought the person in,
/// not whichever channel they happened to touch most recently. A signup is a
/// $pageview reaching the configured signup page path (e.g. "/sign-up"), not a
/// custom event — counted per distinct person since one person can reload/revisit
/// that page more than once.
export async function fetchSignupsByChannel(
  weekStart: Date,
  weekEnd: Date,
  signupPagePath: string
): Promise<PullResult<{ bySource: Array<{ utmSource: string; signups: number }>; total: number }>> {
  const { from, to } = isoRange(weekStart, weekEnd);
  const query = `
    SELECT coalesce(person.properties.$initial_utm_source, 'direct/unknown') AS utm_source, count(DISTINCT person_id) AS signups
    FROM events
    WHERE event = '$pageview' AND properties.$pathname = '${escapeHogQLString(signupPagePath)}'
      AND timestamp >= toDateTime('${from}') AND timestamp <= toDateTime('${to}')
    GROUP BY utm_source
    ORDER BY signups DESC
  `;
  const result = await runHogQL(query);
  if (!result) return { available: false };
  const bySource = result.results.map((row) => ({ utmSource: String(row[0]), signups: Number(row[1]) }));
  const total = bySource.reduce((sum, r) => sum + r.signups, 0);
  return { available: true, pulledAt: new Date(), data: { bySource, total } };
}

/// New Signups (FR-5) — distinct persons who reached the signup page path in
/// the window. Redefined from a custom "signed up" event to a pageview-based
/// success-page hit, since that's what reliably fires today.
export async function fetchTotalSignups(
  weekStart: Date,
  weekEnd: Date,
  signupPagePath: string
): Promise<PullResult<{ count: number }>> {
  const { from, to } = isoRange(weekStart, weekEnd);
  const query = `
    SELECT count(DISTINCT person_id) FROM events
    WHERE event = '$pageview' AND properties.$pathname = '${escapeHogQLString(signupPagePath)}'
      AND timestamp >= toDateTime('${from}') AND timestamp <= toDateTime('${to}')
  `;
  const result = await runHogQL(query);
  if (!result) return { available: false };
  const count = Number(result.results[0]?.[0] ?? 0);
  return { available: true, pulledAt: new Date(), data: { count } };
}

/// Total Unique Website Visitors — anyone with at least one $pageview in the
/// window, regardless of path. The denominator for Primary Conversion Rate
/// ("out of total unique visitors, how many completed sign up").
export async function fetchTotalUniqueVisitors(
  weekStart: Date,
  weekEnd: Date
): Promise<PullResult<{ count: number }>> {
  const { from, to } = isoRange(weekStart, weekEnd);
  const query = `
    SELECT count(DISTINCT person_id) FROM events
    WHERE event = '$pageview'
      AND timestamp >= toDateTime('${from}') AND timestamp <= toDateTime('${to}')
  `;
  const result = await runHogQL(query);
  if (!result) return { available: false };
  const count = Number(result.results[0]?.[0] ?? 0);
  return { available: true, pulledAt: new Date(), data: { count } };
}

/// Blog Organic Sessions (FR-12) — $pageview on /blog/* with no initial UTM source
/// set, a reasonable organic proxy per Section 9.3 (cross-check against Search
/// Console periodically — PostHog's referrer classification can misclassify some
/// search traffic as direct).
export async function fetchBlogOrganicSessions(
  weekStart: Date,
  weekEnd: Date
): Promise<PullResult<{ sessions: number }>> {
  const { from, to } = isoRange(weekStart, weekEnd);
  const query = `
    SELECT count() FROM events
    WHERE event = '$pageview'
      AND properties.$pathname LIKE '/blog/%'
      AND person.properties.$initial_utm_source IS NULL
      AND timestamp >= toDateTime('${from}') AND timestamp <= toDateTime('${to}')
  `;
  const result = await runHogQL(query);
  if (!result) return { available: false };
  const sessions = Number(result.results[0]?.[0] ?? 0);
  return { available: true, pulledAt: new Date(), data: { sessions } };
}
