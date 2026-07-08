# Weekly GTM Analytics Tracker — HydraDB

Phase 1 MVP per `Weekly-Analytics-Tracker-PRD_1.md`. Everything runs today against seeded
mock history; each integration below flips to live the moment its credential is added to
`.env` — no code changes required.

**This is a standalone project** — its own GitHub repo, Supabase project, Vercel project,
and Slack app, deliberately separate from the companion **Content Tracking Dashboard**
(`Ananya_HydraDB Dashboard`). The two apps share nothing except conventions and (per the
PRD) the same underlying HydraDB PostHog analytics project — read with its own,
separately-issued API key, never a copy-pasted credential from the other app's `.env`.

## Stack

- Next.js 14 (App Router) + TypeScript, Tailwind + Tremor (KPI cards, trend charts)
- Postgres (Supabase) + Prisma
- No login — open access, matching what the Content Tracking Dashboard actually shipped
  (the PRD's "stub password gate" requirement was deferred there too; revisit if needed)
- Vitest unit tests for every pure-logic module (trigger engine, CSV parser, lifecycle
  guards, date-window math)

## First-time local setup

```bash
export NVM_DIR="$HOME/.nvm"
source "/opt/homebrew/opt/nvm/nvm.sh"
nvm use   # reads .nvmrc, picks Node 20

npm install
npm run db:migrate   # applies schema to your local Postgres
npm run db:seed       # populates 7 published weeks + 1 in-progress draft week
npm run dev            # http://localhost:3000
```

No credentials are required to explore the app — every integration runs in mock mode
(returns "not pulled yet" rather than a fake number) until you add its env var.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the tracker locally |
| `npm run db:seed` | Re-seed mock history (use `db:reset` first for a clean slate) |
| `npm run db:reset` | Wipe and re-migrate the local database |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run pull:weekly` | Run one on-demand PostHog/Search Console pull for the current week (same as the "Pull latest" button) |
| `npm run ingest:mentions` | Run one CommunityMentions Slack ingestion pass manually |
| `npm test` | Run the unit test suite (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |

## What's built (Phase 1, per PRD Section 12)

- **Weekly report lifecycle** (`draft` → `ready_for_decisions` → `published`) with
  no-silent-blanks enforcement at the schema and server-action layer, not just the UI
  (`src/lib/reportLifecycle.ts`) — every metric is a `(value, N/A reason)` pair.
- **Outcome metrics** (Layer 1) auto-pulled from PostHog's HogQL Query API: New Signups
  (a $pageview reaching the configured sign-up page path, e.g. `/sign-up` — not a custom
  event), Total Unique Website Visitors, and the computed Primary Conversion Rate ("out of
  total unique visitors this week, how many completed sign up"), plus WoW Signup Growth
  (`src/lib/posthog.ts`, `src/lib/metrics/pullMetrics.ts`). Activation Rate was removed
  from this layer for now — revisit later; the underlying `activationEventName` setting is
  kept dormant on `/settings` so re-enabling it doesn't require re-deriving that config.
- **Sign-Ups by Channel** (Layer 2), grouped by `$initial_utm_source` (not the per-event
  value — Section 9.2's attribution warning), same pageview-based signup definition as
  above. A channel that drops to zero this week gets an explicit `0` row instead of
  disappearing, so the 3-week zero-streak trigger can see it.
- **Blog Organic Sessions** auto-pulled from PostHog (`/blog/*`, no-initial-UTM proxy).
- **Twitter follower count** auto-pulled via Scrape.do (`src/lib/scrapeDoTwitter.ts`) —
  renders the X profile page (bypassing bot detection, same technique already validated in
  the Content Tracking Dashboard) and reads the `schema.org ProfilePage` JSON-LD block X
  publishes for SEO. This is genuine structured data X exposes on purpose, confirmed live
  and working. **Weekly engagement + top tweet** come from the Apify `apidojo/tweet-scraper`
  actor (`src/lib/twitterScraper.ts`) when that's available — as of building this, the actor
  itself was returning empty results for every query shape tested (confirmed not a parameter
  issue on our end — see the actor's own docs/schema verification in the codebase history),
  so this degrades gracefully to N/A rather than blocking. **Twitter Impressions stays
  manual** regardless — no view/impression-count field exists in either source, and native
  Twitter Analytics (login-only) is the only real source for that number.
- **General Twitter mentions of HydraDB** — same Apify actor's keyword search (no auth
  needed when it's working), feeding the same organic `brand_mentions` log Layer 3's manual
  entries use, reusing the Branded Query Terms list rather than a separate setting. Currently
  unavailable for the same upstream reason as weekly engagement above.
- **YouTube mentions/relevant content** auto-pulled via Scrape.do's dedicated YouTube search
  plugin (`src/lib/scrapeDoYoutube.ts`) — same token as the Twitter follower count above, one
  request per Branded Query Term, deduped by video ID, feeding the same organic
  `brand_mentions` log. Confirmed live and working (14 real results for "hydradb"/"hydra db").
  A relevance filter (`isRelevantVideo`) discards results YouTube's own fuzzy search
  surfaced that don't actually contain a branded term in the title/description (e.g. an
  unrelated "Hydra" Postgres analytics tool, unrelated songs with "Hydra" in the title) —
  it can't catch a genuine coincidental name collision (a video literally titled with the
  brand's name for something unrelated), so a quick skim before trusting the weekly count is
  still worthwhile.
- **Discord Total Members** auto-pulled via the Discord bot API. **Discord New Members** is
  a net-change approximation (this week's total minus last week's) computed at pull time —
  Discord has no endpoint for retroactively listing who joined when, only a live event
  stream that would need an always-on bot process. **Discord Active Members stays manual**
  (no API gives "posted in the last 7 days" without scanning every channel's history).
- **Manual, guided entry** for **Top DevRel Content Piece** (freetext + link, explicitly
  labeled "DevRel" — real Content Tracking Dashboard integration is a Phase 2 item, PRD
  Section 3) and all four Layer 3 Signal Notes.
- **Search Visibility** (Layer 4) auto-pulled from Google Search Console's Search Analytics
  API, filtered to a configurable branded-terms list (`src/lib/searchConsole.ts`): Branded
  Impressions/Clicks/Avg Position, New Queries Entering Top 20.
- **Brand Mentions** (Layers 3 + 4 unified, `BrandMention` model) — every row carries an
  explicit, always-visible `mention_source` badge (Paid/Organic, `MentionBadge` component).
  Paid ingestion via the CommunityMentions agency's own **dashboard JSON API**
  (`src/lib/mentions/dashboardApi.ts` — confirmed live, 936 real mentions across 5
  platforms), with **Slack** and **manual CSV upload** (`/mentions/upload`) as coexisting
  fallbacks sharing the exact same dedup convention (see "CommunityMentions ingestion"
  below). Only `status = verified` counts toward weekly Paid totals; `posting` is ingested
  but excluded until it transitions.
- **Intervention Trigger Engine** — all 8 rules from PRD Section 5/FR-17, each a pure,
  independently-tested function (`src/lib/triggers/evaluate.ts`) reading config-driven
  thresholds (`src/lib/triggers/runner.ts` does the DB/history fetch). Triggers are
  informational, never a publish blocker (FR-20).
- **Decision log** with the Specific/Time-bound/Falsifiable self-certification gate
  (`src/lib/reportLifecycle.ts#canPublish`) — a checklist, not an AI quality judgment.
- **Historical trend view** (`/trends`) — signups, Primary Conversion Rate, per-channel
  signups, blog sessions, the combined Branded Search Impressions + Total Mentions chart
  (FR-33), and the Paid vs. Organic comparison panel (FR-33a).
- **No automated distribution** — publishing a report doesn't post anywhere. The team's
  Slack channel is reserved for the CommunityMentions agency's daily drop, not weekly
  report noise. A "copy as Discord-formatted text" button on each report lets you share
  the summary manually wherever makes sense that week. No email path exists anywhere in
  this codebase either, per the PRD's explicit instruction (FR-28).
- **Settings page** (`/settings`) — every trigger threshold, the locked activation event
  (FR-6a: requires an explicit confirmation checkbox, not a plain edit), the signup event
  name, and the branded query term list are editable config, not hardcoded (FR-19).

Deferred to Phase 2/3 per the PRD's own phasing: real Content Tracking Dashboard
integration for Top DevRel Content Piece, Churned/Inactive Sign-Ups + Time to Activation
automation, Discord member-count automation, 48-hour organic-mention follow-up reminders,
Twitter impressions automation, LLM-assisted decision drafting.

## CommunityMentions ingestion

FR-31 lists three possible ingestion paths (Slack parsing, Google Sheets sync, manual CSV)
and explicitly says to architect so switching between them doesn't require a data-model
change. As of the agency sharing their own dashboard details, there's now a **confirmed,
live, working** path: their read-only dashboard JSON API
(`src/lib/mentions/dashboardApi.ts`) — the same data that powers their pinned Google Sheet
at `https://docs.google.com/spreadsheets/d/1SLydmxiAAJ07X_vhuqae3FGNdWlAmWw8Kswh-LnGuok`,
fetched directly with a query-string token, no OAuth/service-account setup needed. Verified
live: 936 real mentions returned across all 5 platforms (Reddit, X, Medium, YouTube,
LinkedIn) for a 60-day window, zero unparseable rows. This is the recommended primary path
— see Section 1 below.

**Slack parsing** (`ingestMentionsFromSlack`) and the **manual CSV upload page**
(`/mentions/upload`) both still work and run alongside the dashboard API, per FR-31's "no
path lock-in" requirement — the PRD's own Open Question #8 flagged that the real format of
the agency's daily Slack message was unconfirmed, so Slack ingestion looks for any `.csv`
file attachment on a message in `SLACK_MENTIONS_CHANNEL_ID` rather than a specific format.
All three paths write through the same `upsertMentionRow` helper and share one externalId
dedup convention (derived from `commentUrl`, or `date|channel|postUrl` when there's no
comment URL) — the same mention picked up by more than one path collapses into a single
`BrandMention` row instead of duplicating.

The dashboard API's own status vocabulary uses `"posted"` where the CSV schema uses
`"posting"` for the same not-yet-machine-verified state — `dashboardApi.ts` translates it
so every consumer keeps working off one vocabulary (`posting` / `verified` / `removed`).
The API also returns `numComments`, `impressions`, and `backlink` per row — richer data than
the confirmed CSV schema — that isn't captured yet since nothing in the current model uses
it; worth adding if a future metric wants it.

## Going live: credentials, one at a time

Each is independent — add it, redeploy, that source goes live. Everything else keeps
running in mock mode.

### 1. CommunityMentions dashboard API (preferred — confirmed live and working)
1. Set `COMMUNITY_MENTIONS_API_URL` (already defaults to
   `https://reddit-k539.onrender.com/api/reports/public/dashboard` in `.env.example`) and
   `COMMUNITY_MENTIONS_API_TOKEN` — no OAuth/service-account setup, the token is a
   query-string param the agency already provided.
2. That's it — the daily cron (`/api/cron/mentions-ingest`) queries a rolling 60-day window
   on every run and upserts by `externalId`, so a row that transitions `posted` (mapped to
   `posting`) → `verified` days later is picked up automatically. Verified live: 936 real
   mentions across Reddit/X/Medium/YouTube/LinkedIn.
3. The agency also shared a pinned Google Sheet
   (`https://docs.google.com/spreadsheets/d/1SLydmxiAAJ07X_vhuqae3FGNdWlAmWw8Kswh-LnGuok`)
   with the same underlying data — that's the human-browsable version; this API is what the
   app itself reads. No code change needed if you ever want to sanity-check one against the
   other.

### 2. Slack (optional fallback — read-only, used only for CommunityMentions ingestion)
This project never posts to Slack — no weekly-report distribution. With Section 1 above
configured, this is now a fallback per FR-31's "no path lock-in," not the primary path.
1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. **OAuth & Permissions → Bot Token Scopes**: `channels:history`, `channels:read` (add
   `groups:history` instead of `channels:history` if the channel is private).
3. **Install to Workspace**, copy the **Bot User OAuth Token** (`xoxb-...`) → `SLACK_BOT_TOKEN`.
4. Invite the bot to that existing CommunityMentions channel → its ID is
   `SLACK_MENTIONS_CHANNEL_ID`.

### 3. PostHog (new Personal API Key, same underlying HydraDB project)
Settings → Personal API Keys → scoped to read-only Query access on the existing HydraDB
project. `POSTHOG_PROJECT_ID` is the same project ID the Content Tracking Dashboard uses —
this is the one deliberate credential-adjacent value that's shared, because it's the same
real signups data, not a duplicate.

### 4. Google Search Console (new service account)
1. Google Cloud Console → create a service account → generate a JSON key.
2. In Search Console (the verified `hydradb.com` property) → **Settings → Users and
   permissions** → add the service account's email as a user with **Restricted** (read)
   access.
3. `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL` / `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY` from the JSON
   key, `GOOGLE_SEARCH_CONSOLE_SITE_URL` = the exact property identifier (e.g.
   `sc-domain:hydradb.com`).
4. Set the branded query term list on `/settings` (Open Question #9) — Search Visibility
   metrics stay unavailable until at least one term is configured.

### 5. Sign-up page path
Confirm the exact page path a successful sign-up lands a visitor on (default `/sign-up`)
and set it on `/settings` — New Signups, Sign-Ups by Channel, and Primary Conversion Rate
all key off it. (The Activation Event setting on the same page is dormant for now —
Outcome-layer Activation Rate was removed, revisit later.)

### 6. Twitter/X follower count (Scrape.do) — confirmed live and working
1. [Scrape.do dashboard](https://dashboard.scrape.do/) → copy your token → `SCRAPE_DO_TOKEN`.
   Free tier (1,000 requests/month) is enough for a weekly pull. Get a **new** token for
   this project rather than reusing the Content Tracking Dashboard's.
2. Set the **Twitter Scraper handle** on `/settings` (default `Hydra_DB`).
3. That's it — this renders the X profile page and reads its `ProfilePage` JSON-LD block
   for follower count. No further config, no auth beyond the token.

### 7. Twitter/X weekly engagement + mentions (Apify) — currently blocked upstream
1. [Apify Console](https://console.apify.com/) → **Settings → Integrations** → copy your
   API token → `APIFY_API_TOKEN`. This uses the `apidojo/tweet-scraper` actor — no separate
   subscription needed beyond your Apify account's usage-based billing (~$0.40/1,000 tweets,
   50-tweet minimum per query; a weekly pull is a few cents/month at this volume).
2. General mentions reuse the **Branded Query Terms** list from Section 4 above — no
   separate setting.
3. **Known limitation**: as of building this, live test calls against this actor —
   including a trivial broad-term search and even a direct profile-URL fetch for a known
   real account — all returned zero real results identically. This rules out a parameter
   issue on our end (verified against the actor's real input/output schema via Apify's API
   directly, not just its marketing docs); the actor itself appears blocked or has an
   account/billing issue on the Apify side. Check your Apify Console's Runs tab and
   Billing/Usage page. The integration degrades gracefully to N/A in the meantime and needs
   no code changes once the actor starts returning data again. A second actor
   (`simpleapi/twitter-x-tweets-scraper`) was also tried and requires a paid rental
   (`actor-is-not-rented` error) before it can even be tested — its schema has no
   keyword-search capability at all regardless, so it can only ever help with weekly
   engagement, not general mentions.

### 8. Discord member count (bot API)
1. [discord.com/developers/applications](https://discord.com/developers/applications) →
   **New Application** → **Bot** tab → **Reset Token** → copy it → `DISCORD_BOT_TOKEN`. No
   privileged intents needed — just the member count.
2. **OAuth2 → URL Generator** → scope `bot` (no permissions needed) → open the generated
   URL and add the bot to the HydraDB server.
3. Set the **Discord guild (server) ID** on `/settings` (defaults to the one already
   configured: `1489825700079734845`).
4. Total Members auto-pulls immediately. New Members (the week-over-week delta) needs one
   prior week's total already stored before it can compute anything — it'll show
   "N/A — no prior week's total to compare against yet" on the first pull.

### 9. YouTube mentions (Scrape.do) — confirmed live and working
1. Uses the same `SCRAPE_DO_TOKEN` as Section 6 above — no separate credential.
2. Reuses the **Branded Query Terms** list from Section 4 — no separate setting. Each term
   is searched independently via `GET https://api.scrape.do/plugin/google/youtube` and
   results are deduped by video ID before being written to the organic `brand_mentions` log.
3. Published dates come back from YouTube only as relative text ("3 days ago", "2 weeks
   ago") and are converted to an approximate absolute date anchored to pull time — good
   enough to bucket into the right week, not exact to the day, and month/year units use a
   fixed 30/365-day approximation.
4. **Known limitation**: YouTube's search relevance is fuzzy word-overlap, not exact-phrase
   matching, so a raw search for a two-word term like "hydra db" also surfaces unrelated
   results (an unrelated "Hydra" Postgres analytics tool, unrelated songs with "Hydra" in
   the title). A post-filter (`isRelevantVideo`) drops anything that doesn't literally
   contain a branded term in its title/description before it reaches the mentions log — but
   it can't distinguish a genuine coincidental collision (something else literally named
   with the brand's exact term) from a real mention. Treat this the same as any other
   organic mention: worth a skim, not a fully hands-off number.

## Deploying to Supabase + Vercel

This project is **not deployed yet** — set up your own Supabase project, GitHub repo, and
Vercel project (see the top of this README for why these must be new, not shared with the
Content Tracking Dashboard).

1. **GitHub**: create an empty repo, then from this project:
   ```bash
   git remote add origin <your-new-repo-url>
   git push -u origin main
   ```
2. **Supabase**: create a new project → **Project Settings → Database** → copy the pooled
   connection string (port 6543, `?pgbouncer=true`) into `DATABASE_URL` and the direct
   connection string (port 5432) into `DIRECT_URL`. Run migrations against the direct URL
   once to initialize:
   ```bash
   npx prisma migrate deploy
   ```
   After that, no manual migration step is needed again — `npm run build` runs
   `prisma migrate deploy && next build`, so every future Vercel deploy applies any new
   migrations automatically before building.
3. **Vercel**: **Add New Project** → import the new GitHub repo. Paste in all the env vars
   from `.env.example` that you have values for (blank is fine — same mock-mode fallback
   as local). `vercel.json` already defines both Cron Jobs (weekly metrics pull, daily
   mentions ingestion) — they activate automatically once deployed on a plan that supports
   the configured schedules (Hobby supports daily cron; the weekly cron is well within that
   limit too since it only fires once a week).
4. Set `APP_URL` to the deployed URL once you have it (used in Slack summary links) and
   redeploy.

## Project structure

```
prisma/schema.prisma              Data model (WeeklyReport + all Layer 1-4 child tables)
prisma/seed.ts                     Mock data generator (7 published weeks + 1 draft)
src/lib/posthog.ts                 PostHog HogQL Query API client
src/lib/searchConsole.ts           Google Search Console client
src/lib/scrapeDoTwitter.ts         Twitter/X follower count via Scrape.do (JSON-LD ProfilePage block)
src/lib/scrapeDoYoutube.ts         YouTube mentions via Scrape.do's YouTube search plugin, with a relevance post-filter
src/lib/twitterScraper.ts          Twitter/X weekly engagement + mentions via the Apify tweet-scraper actor
src/lib/discordApi.ts              Discord bot API — total member count only
src/lib/slack.ts                   Thin Slack Web API wrapper (CommunityMentions ingestion only, no posting)
src/lib/distribution.ts            "Copy as Discord text" summary builder — no automated posting
src/lib/mentions/csvParser.ts      Pure CommunityMentions CSV parser (shared by all ingestion paths)
src/lib/mentions/dashboardApi.ts   CommunityMentions agency's dashboard JSON API client (preferred path)
src/lib/mentions/ingestMentions.ts Dashboard API + Slack + manual-CSV ingestion into BrandMention
src/lib/metrics/pullMetrics.ts     On-demand PostHog/Search Console pull, called by button + cron
src/lib/triggers/evaluate.ts       The 8 intervention-trigger rules, pure & independently tested
src/lib/triggers/runner.ts         DB-facing orchestrator: fetches history, calls evaluate.ts, persists flags
src/lib/reportLifecycle.ts         No-blanks + decision-quality gates (FR-1..4, FR-21..23)
src/lib/data/                      Query layer feeding the UI (reports, trends, mentions)
src/app/page.tsx                   Redirects to the current week's report (creating it if missing)
src/app/reports/[week]/            The guided weekly fill-in form + its Server Actions
src/app/trends/                    Historical charts + past-report index
src/app/mentions/upload/           Manual CSV upload fallback for CommunityMentions
src/app/settings/                  Trigger thresholds, activation-event lock, branded terms
src/app/api/cron/weekly-pull/      Vercel Cron: ensure this week's draft + auto-pull + re-evaluate triggers
src/app/api/cron/mentions-ingest/  Vercel Cron: daily dashboard-API pull + Slack CSV poll
scripts/pullWeekly.ts              CLI entry point for `npm run pull:weekly`
scripts/ingestMentions.ts          CLI entry point for `npm run ingest:mentions`
```

## Open questions carried over from the PRD

See Section 13 of the PRD for the full list. The ones most likely to need a decision before
this goes fully live:

- **Channel dominance threshold** (Open Question #3) — defaulted to 50% on `/settings`, not confirmed.
- **CommunityMentions ingestion format** (Open Question #8) — resolved: the agency's
  dashboard JSON API is confirmed live and working (see "CommunityMentions ingestion"
  above); Slack/CSV remain as coexisting fallbacks, not because the format is still unknown.
- **Branded query term list** (Open Question #9) — empty until set on `/settings`.
- **CommunityMentions scope** (Open Question #10) — the `brand` field on `BrandMention` is
  nullable/unused until Skillmake coverage is confirmed.
