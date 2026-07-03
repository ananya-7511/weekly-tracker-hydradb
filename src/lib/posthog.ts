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
/// not whichever channel they happened to touch most recently.
export async function fetchSignupsByChannel(
  weekStart: Date,
  weekEnd: Date,
  signupEventName: string
): Promise<PullResult<{ bySource: Array<{ utmSource: string; signups: number }>; total: number }>> {
  const { from, to } = isoRange(weekStart, weekEnd);
  const query = `
    SELECT coalesce(person.properties.$initial_utm_source, 'direct/unknown') AS utm_source, count() AS signups
    FROM events
    WHERE event = '${escapeHogQLString(signupEventName)}'
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

/// New Signups (FR-5) — total count of the signup event in the window.
export async function fetchTotalSignups(
  weekStart: Date,
  weekEnd: Date,
  signupEventName: string
): Promise<PullResult<{ count: number }>> {
  const { from, to } = isoRange(weekStart, weekEnd);
  const query = `
    SELECT count() FROM events
    WHERE event = '${escapeHogQLString(signupEventName)}'
      AND timestamp >= toDateTime('${from}') AND timestamp <= toDateTime('${to}')
  `;
  const result = await runHogQL(query);
  if (!result) return { available: false };
  const count = Number(result.results[0]?.[0] ?? 0);
  return { available: true, pulledAt: new Date(), data: { count } };
}

/// Activated Users (FR-6/FR-7) — signups in the window who also fired the
/// admin-locked activation event within a 7-day conversion window (Section 9.3,
/// Open Question #6's default assumption).
export async function fetchActivationFunnel(
  weekStart: Date,
  weekEnd: Date,
  signupEventName: string,
  activationEventName: string
): Promise<PullResult<{ signups: number; activated: number }>> {
  const { from, to } = isoRange(weekStart, weekEnd);
  const signupEsc = escapeHogQLString(signupEventName);
  const activationEsc = escapeHogQLString(activationEventName);
  const query = `
    SELECT
      count(DISTINCT signup.person_id) AS signups,
      count(DISTINCT activation.person_id) AS activated
    FROM (
      SELECT person_id, timestamp FROM events
      WHERE event = '${signupEsc}' AND timestamp >= toDateTime('${from}') AND timestamp <= toDateTime('${to}')
    ) AS signup
    LEFT JOIN (
      SELECT person_id, timestamp FROM events WHERE event = '${activationEsc}'
    ) AS activation
    ON signup.person_id = activation.person_id
      AND activation.timestamp >= signup.timestamp
      AND activation.timestamp <= signup.timestamp + INTERVAL 7 DAY
  `;
  const result = await runHogQL(query);
  if (!result) return { available: false };
  const [signups, activated] = result.results[0] ?? [0, 0];
  return { available: true, pulledAt: new Date(), data: { signups: Number(signups), activated: Number(activated) } };
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

/// Churned/Inactive Sign-Ups (FR-15) — signed up in the window, never fired the
/// activation event at all (Section 9.3's "performed X but not Y" cohort logic).
export async function fetchChurnedInactive(
  weekStart: Date,
  weekEnd: Date,
  signupEventName: string,
  activationEventName: string
): Promise<PullResult<{ count: number }>> {
  const { from, to } = isoRange(weekStart, weekEnd);
  const signupEsc = escapeHogQLString(signupEventName);
  const activationEsc = escapeHogQLString(activationEventName);
  const query = `
    SELECT count(DISTINCT signup.person_id) FROM (
      SELECT person_id, timestamp FROM events
      WHERE event = '${signupEsc}' AND timestamp >= toDateTime('${from}') AND timestamp <= toDateTime('${to}')
    ) AS signup
    WHERE NOT EXISTS (
      SELECT 1 FROM events AS activation
      WHERE activation.event = '${activationEsc}'
        AND activation.person_id = signup.person_id
        AND activation.timestamp >= signup.timestamp
    )
  `;
  const result = await runHogQL(query);
  if (!result) return { available: false };
  const count = Number(result.results[0]?.[0] ?? 0);
  return { available: true, pulledAt: new Date(), data: { count } };
}
