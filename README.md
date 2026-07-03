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
- **Outcome metrics** (Layer 1) auto-pulled from PostHog's HogQL Query API: New Signups,
  Activated Users, Activation Rate, WoW Signup Growth (`src/lib/posthog.ts`,
  `src/lib/metrics/pullMetrics.ts`).
- **Sign-Ups by Channel** (Layer 2), grouped by `$initial_utm_source` (not the per-event
  value — Section 9.2's attribution warning). A channel that drops to zero this week gets
  an explicit `0` row instead of disappearing, so the 3-week zero-streak trigger can see it.
- **Blog Organic Sessions** auto-pulled from PostHog (`/blog/*`, no-initial-UTM proxy).
- **Manual, guided entry** for Twitter Impressions (organic/influencer split), Discord
  Active/Total Members, **Top DevRel Content Piece** (freetext + link, explicitly labeled
  "DevRel" — real Content Tracking Dashboard integration is a Phase 2 item, PRD Section 3),
  and all four Layer 3 Signal Notes.
- **Search Visibility** (Layer 4) auto-pulled from Google Search Console's Search Analytics
  API, filtered to a configurable branded-terms list (`src/lib/searchConsole.ts`): Branded
  Impressions/Clicks/Avg Position, New Queries Entering Top 20.
- **Brand Mentions** (Layers 3 + 4 unified, `BrandMention` model) — every row carries an
  explicit, always-visible `mention_source` badge (Paid/Organic, `MentionBadge` component).
  Paid ingestion via **Slack** (`src/lib/mentions/ingestMentions.ts` — see "CommunityMentions
  ingestion" below for an important caveat) with a **manual CSV upload** fallback
  (`/mentions/upload`) sharing the exact same parser (`src/lib/mentions/csvParser.ts`).
  Only `status = verified` counts toward weekly Paid totals; `posting` is ingested but
  excluded until it transitions.
- **Intervention Trigger Engine** — all 8 rules from PRD Section 5/FR-17, each a pure,
  independently-tested function (`src/lib/triggers/evaluate.ts`) reading config-driven
  thresholds (`src/lib/triggers/runner.ts` does the DB/history fetch). Triggers are
  informational, never a publish blocker (FR-20).
- **Decision log** with the Specific/Time-bound/Falsifiable self-certification gate
  (`src/lib/reportLifecycle.ts#canPublish`) — a checklist, not an AI quality judgment.
- **Historical trend view** (`/trends`) — signups, activation rate, per-channel signups,
  blog sessions, the combined Branded Search Impressions + Total Mentions chart (FR-33),
  and the Paid vs. Organic comparison panel (FR-33a).
- **Distribution** on publish — a formatted summary posted to Slack (`chat.postMessage`),
  plus a "copy as Discord-formatted text" fallback button. No email path exists anywhere
  in this codebase, per the PRD's explicit instruction (FR-28).
- **Settings page** (`/settings`) — every trigger threshold, the locked activation event
  (FR-6a: requires an explicit confirmation checkbox, not a plain edit), the signup event
  name, and the branded query term list are editable config, not hardcoded (FR-19).

Deferred to Phase 2/3 per the PRD's own phasing: real Content Tracking Dashboard
integration for Top DevRel Content Piece, Churned/Inactive Sign-Ups + Time to Activation
automation, Discord member-count automation, 48-hour organic-mention follow-up reminders,
Twitter impressions automation, LLM-assisted decision drafting.

## CommunityMentions ingestion — an important assumption to verify

FR-31 lists three possible ingestion paths (Slack parsing, Google Sheets sync, manual CSV)
and explicitly says to architect so switching between them doesn't require a data-model
change. We built **Slack parsing** as the Phase 1 path, but the PRD's own Open Question #8
flags that **the real format of the agency's daily Slack message is unconfirmed** — the
only artifact that IS confirmed is the CSV column schema itself
(`Date, Channel, Subreddit, Post Title, Post URL, Comment, Comment URL, Thread Upvotes, Status`).

So `src/lib/mentions/ingestMentions.ts` looks for **any `.csv` file attachment** on a
message in the configured `SLACK_MENTIONS_CHANNEL_ID` channel — not a specific message
format. If the agency's actual daily report turns out to look different (e.g., an inline
table instead of an attachment, or arrives via email/Google Sheets instead of Slack),
this will need a real adjustment once you've seen one actual message. Until then, or if
Slack ingestion is never configured, **the manual CSV upload page (`/mentions/upload`)
works identically** — same parser, same dedup logic, zero functional gap.

## Going live: credentials, one at a time

Each is independent — add it, redeploy, that source goes live. Everything else keeps
running in mock mode.

### 1. Slack (new app — do not reuse the Content Tracking Dashboard's bot token)
1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. **OAuth & Permissions → Bot Token Scopes**: `channels:history`, `channels:read`,
   `chat:write` (add `groups:history` instead of `channels:history` if a channel is private).
3. **Install to Workspace**, copy the **Bot User OAuth Token** (`xoxb-...`) → `SLACK_BOT_TOKEN`.
4. Invite the bot to `#gtm-weekly` (or whatever you name it) → that channel's ID is
   `SLACK_CHANNEL_ID` (distribution target, FR-26).
5. Decide where the CommunityMentions agency's daily export lands — invite the same bot
   there too, and set `SLACK_MENTIONS_CHANNEL_ID` (can be the same channel or a dedicated one).

### 2. PostHog (new Personal API Key, same underlying HydraDB project)
Settings → Personal API Keys → scoped to read-only Query access on the existing HydraDB
project. `POSTHOG_PROJECT_ID` is the same project ID the Content Tracking Dashboard uses —
this is the one deliberate credential-adjacent value that's shared, because it's the same
real signups data, not a duplicate.

### 3. Google Search Console (new service account)
1. Google Cloud Console → create a service account → generate a JSON key.
2. In Search Console (the verified `hydradb.com` property) → **Settings → Users and
   permissions** → add the service account's email as a user with **Restricted** (read)
   access.
3. `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL` / `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY` from the JSON
   key, `GOOGLE_SEARCH_CONSOLE_SITE_URL` = the exact property identifier (e.g.
   `sc-domain:hydradb.com`).
4. Set the branded query term list on `/settings` (Open Question #9) — Search Visibility
   metrics stay unavailable until at least one term is configured.

### 4. Activation event (Open Question #1)
Confirm the exact PostHog event name that constitutes "activated" (e.g., "connected a
database") and lock it on `/settings` before relying on Activation Rate — this gates
FR-6/FR-7 and the low-activation trigger.

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
   connection string (port 5432) into `DIRECT_URL`. Run migrations against the direct URL:
   ```bash
   npx prisma migrate deploy
   ```
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
src/lib/slack.ts                   Thin Slack Web API wrapper (shared by ingestion + distribution)
src/lib/distribution.ts            Slack/Discord formatted summary builder, publish-time post
src/lib/mentions/csvParser.ts      Pure CommunityMentions CSV parser (shared by both ingestion paths)
src/lib/mentions/ingestMentions.ts Slack + manual-CSV ingestion into BrandMention
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
src/app/api/cron/mentions-ingest/  Vercel Cron: daily Slack CSV poll
scripts/pullWeekly.ts              CLI entry point for `npm run pull:weekly`
scripts/ingestMentions.ts          CLI entry point for `npm run ingest:mentions`
```

## Open questions carried over from the PRD

See Section 13 of the PRD for the full list. The ones most likely to need a decision before
this goes fully live:

- **Channel dominance threshold** (Open Question #3) — defaulted to 50% on `/settings`, not confirmed.
- **CommunityMentions ingestion format** (Open Question #8) — see the callout above.
- **Branded query term list** (Open Question #9) — empty until set on `/settings`.
- **CommunityMentions scope** (Open Question #10) — the `brand` field on `BrandMention` is
  nullable/unused until Skillmake coverage is confirmed.
