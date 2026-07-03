import { PrismaClient, MentionSource, MentionPlatform, MentionStatus, MentionSourceMethod, SignalType, TriggerType } from "@prisma/client";
import { mondayOf, weekEndOf, formatWeekLabel } from "../src/lib/dateWindow";

const prisma = new PrismaClient();

function rand(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 999) * 10000;
  const frac = x - Math.floor(x);
  return Math.floor(min + frac * (max - min));
}

const CHANNELS = ["twitter", "blog", "discord", "reddit-ads", "direct/unknown"];
const SIGNUP_EVENT = "user signed up";
const ACTIVATION_EVENT = "connected a database";

const TRIGGER_CONFIG_DEFAULTS: Array<{ key: string; value: number; description: string }> = [
  { key: "activation_floor_pct", value: 20, description: "Below this activation rate, flag to product (Section 5)." },
  { key: "channel_dominance_pct", value: 50, description: "A channel above this share of total signups triggers 'double down' (FR-19 placeholder default — confirm, Open Question #3)." },
  { key: "zero_streak_weeks", value: 3, description: "Consecutive weeks a channel is at zero before flagging 'pause it.'" },
  { key: "mentions_search_lookback_days", value: 60, description: "Lookback for 'paid mentions rising but branded search flat' (matches the agency's own stated timeframe)." },
  { key: "mentions_zero_streak_weeks", value: 2, description: "Consecutive weeks a paid-mentions platform at zero verified before flagging the agency." },
  { key: "organic_share_lookback_weeks", value: 4, description: "Lookback window for 'organic share of paid/organic split trending toward zero.'" },
];

async function main() {
  console.log("Seeding TriggerConfig defaults...");
  for (const cfg of TRIGGER_CONFIG_DEFAULTS) {
    await prisma.triggerConfig.upsert({
      where: { key: cfg.key },
      create: cfg,
      update: { value: cfg.value, description: cfg.description },
    });
  }

  console.log("Seeding AppSettings (locked activation event)...");
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      signupEventName: SIGNUP_EVENT,
      activationEventName: ACTIVATION_EVENT,
      activationEventLockedAt: new Date(),
      brandedQueryTerms: ["hydradb", "hydra db", "hydra-db"],
    },
    update: {},
  });

  const currentWeekStart = mondayOf(new Date());
  // 7 published weeks of history + the current week as an in-progress draft.
  const weekStarts: Date[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(currentWeekStart);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    weekStarts.push(d);
  }

  let priorSignups: number | null = null;

  for (let weekIndex = 0; weekIndex < weekStarts.length; weekIndex++) {
    const weekStart = weekStarts[weekIndex];
    const weekEnd = weekEndOf(weekStart);
    const isCurrentWeek = weekIndex === weekStarts.length - 1;
    const seed = weekIndex + 1;

    console.log(`Seeding week ${formatWeekLabel(weekStart)}${isCurrentWeek ? " (current, draft)" : ""}...`);

    // Baseline ~40 signups, growing ~12%/week, with natural noise.
    const baseSignups = Math.round(40 * Math.pow(1.12, weekIndex) + rand(seed, -3, 4));
    const newSignups = isCurrentWeek ? null : baseSignups; // current week: not pulled yet, deliberately blank to exercise the "N/A required" gate

    // Week index 3 (a past week) deliberately has a flat/low activation rate to
    // demonstrate the <20% intervention trigger.
    const isLowActivationWeek = weekIndex === 3;
    const activationRatePct = isLowActivationWeek ? 15 : rand(seed, 30, 42);
    const activatedUsers = newSignups === null ? null : Math.round((newSignups * activationRatePct) / 100);

    const report = await prisma.weeklyReport.create({
      data: {
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        status: isCurrentWeek ? "draft" : "published",
        createdBy: "Ananya",
        publishedAt: isCurrentWeek ? null : new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    await prisma.outcomeMetrics.create({
      data: {
        reportId: report.id,
        newSignups,
        newSignupsNaReason: newSignups === null ? "N/A — not pulled yet this week" : null,
        newSignupsPulledAt: newSignups === null ? null : new Date(),
        newSignupsSource: newSignups === null ? null : "PostHog: Weekly Signups by Source",
        activatedUsers,
        activatedUsersNaReason: activatedUsers === null ? "N/A — depends on New Signups pull" : null,
        activatedUsersPulledAt: activatedUsers === null ? null : new Date(),
        activationRate: activatedUsers !== null && newSignups ? activatedUsers / newSignups : null,
        wowSignupGrowthPct: newSignups !== null && priorSignups ? ((newSignups - priorSignups) / priorSignups) * 100 : null,
      },
    });
    if (newSignups !== null) priorSignups = newSignups;

    // Sign-Ups by Channel — reddit-ads deliberately zero for the last 3 published
    // weeks (weekIndex 4,5,6) to demonstrate the zero-streak trigger. The current
    // week (index 7) is left unpulled, matching newSignups above.
    for (const channel of CHANNELS) {
      const isDeadChannel = channel === "reddit-ads" && weekIndex >= 4 && weekIndex <= 6;
      const channelSignups = isCurrentWeek
        ? null
        : isDeadChannel
        ? 0
        : Math.round((newSignups ?? 0) * rand(seed + channel.length, 10, 35) / 100);
      await prisma.channelMetrics.create({
        data: {
          reportId: report.id,
          utmSource: channel,
          signups: channelSignups,
          naReason: channelSignups === null ? "N/A — not pulled yet this week" : null,
          pulledAt: channelSignups === null ? null : new Date(),
        },
      });
    }

    await prisma.weeklyExtras.create({
      data: {
        reportId: report.id,
        topDevrelContentFreetext: isCurrentWeek ? null : "Tutorial: \"Graphs vs. Vector Databases\" (blog post)",
        topDevrelContentUrl: isCurrentWeek ? null : "https://hydradb.com/blog/graphs-vs-vector-databases",
        topDevrelContentNaReason: isCurrentWeek ? "N/A — not filled in yet" : null,
        twitterImpressionsOrganic: isCurrentWeek ? null : rand(seed, 800, 4000),
        twitterImpressionsInfluencer: isCurrentWeek ? null : rand(seed + 1, 0, 6000),
        twitterImpressionsNaReason: isCurrentWeek ? "N/A — Ananya pastes this in manually each Monday" : null,
        topTweetUrl: isCurrentWeek ? null : "https://x.com/Hydra_DB/status/1234567890",
        blogOrganicSessions: isCurrentWeek ? null : rand(seed + 2, 50, 900),
        blogOrganicSessionsNaReason: isCurrentWeek ? "N/A — not pulled yet this week" : null,
        blogOrganicSessionsPulledAt: isCurrentWeek ? null : new Date(),
        blogOrganicSessionsSource: isCurrentWeek ? null : "PostHog: Blog Organic Sessions",
        discordActiveMembers: isCurrentWeek ? null : rand(seed + 3, 30, 140),
        discordTotalMembers: isCurrentWeek ? null : 400 + weekIndex * 15,
        discordNaReason: isCurrentWeek ? "N/A — manual weekly count not done yet" : null,
      },
    });

    const signalDefs: Array<{ type: SignalType; note: string; value: number | null; needsFollowup?: boolean }> = [
      { type: "source_quality", note: "Signups this week skew toward backend engineers at seed-stage startups — good ICP fit.", value: null },
      { type: "time_to_activation", note: "Median time-to-activation holding steady around 2 days.", value: 2 },
      { type: "organic_impressions", note: "Unprompted shoutout in a Postgres Discord server — founder replied directly.", value: null, needsFollowup: !isCurrentWeek && weekIndex === weekStarts.length - 2 },
      { type: "churned_inactive", note: "A handful of signups from a Reddit thread never came back after signup.", value: rand(seed + 4, 2, 12) },
    ];
    for (const s of signalDefs) {
      await prisma.signalNote.create({
        data: {
          reportId: report.id,
          signalType: s.type,
          note: isCurrentWeek ? null : s.note,
          value: isCurrentWeek ? null : s.value,
          needsFollowup: s.needsFollowup ?? false,
          naReason: isCurrentWeek ? "N/A — not reviewed yet this week" : null,
        },
      });
    }

    await prisma.searchVisibilityMetrics.create({
      data: {
        reportId: report.id,
        brandedImpressions: isCurrentWeek ? null : rand(seed + 5, 300, 1200),
        brandedClicks: isCurrentWeek ? null : rand(seed + 6, 20, 150),
        avgPosition: isCurrentWeek ? null : 4 + rand(seed + 7, 0, 30) / 10,
        newTop20Queries: isCurrentWeek ? [] : weekIndex % 2 === 0 ? ["hydradb pricing", "hydradb vs neo4j"] : [],
        naReason: isCurrentWeek ? "N/A — not pulled yet this week" : null,
        pulledAt: isCurrentWeek ? null : new Date(),
      },
    });

    // Brand mentions: paid (CommunityMentions-style) + organic, skewed paid-heavy
    // like the real Section 5 export (roughly balanced across 5 platforms).
    if (!isCurrentWeek) {
      const paidPlatforms: MentionPlatform[] = ["reddit", "medium", "youtube", "linkedin", "x"];
      for (const platform of paidPlatforms) {
        const countThisWeek = rand(seed + platform.length, 1, 5);
        for (let i = 0; i < countThisWeek; i++) {
          const status: MentionStatus = rand(seed + i, 0, 10) === 0 ? "posting" : "verified";
          await prisma.brandMention.create({
            data: {
              reportId: report.id,
              mentionSource: MentionSource.paid,
              platform,
              subreddit: platform === "reddit" ? "r/databases" : null,
              postTitle: `Discussion thread about graph databases #${weekIndex}-${i}`,
              postUrl: `https://example.com/${platform}/thread-${weekIndex}-${i}`,
              commentText: "Sharing a quick note about HydraDB's approach to this...",
              commentUrl: `https://example.com/${platform}/comment-${weekIndex}-${i}`,
              status,
              threadUpvotes: platform === "reddit" ? rand(seed + i, 3, 80) : null,
              postedDate: new Date(weekStart.getTime() + i * 12 * 60 * 60 * 1000),
              sourceMethod: MentionSourceMethod.manual_csv,
              externalId: `seed-paid-${weekIndex}-${platform}-${i}`,
            },
          });
        }
      }
      // A small, deliberately shrinking trickle of organic mentions (weekIndex 6
      // has none) so the "organic share trending toward zero" trigger has
      // something to detect over the lookback window.
      const organicCount = weekIndex >= 6 ? 0 : rand(seed + 9, 0, 2);
      for (let i = 0; i < organicCount; i++) {
        await prisma.brandMention.create({
          data: {
            reportId: report.id,
            mentionSource: MentionSource.organic,
            platform: i % 2 === 0 ? MentionPlatform.discord : MentionPlatform.x,
            postTitle: null,
            postUrl: `https://example.com/organic/${weekIndex}-${i}`,
            commentText: "Someone mentioned HydraDB unprompted while comparing graph DB options.",
            commentUrl: null,
            status: null,
            loggedBy: "Ananya",
            postedDate: new Date(weekStart.getTime() + i * 8 * 60 * 60 * 1000),
            sourceMethod: MentionSourceMethod.manual_entry,
            needsFollowup: weekIndex === weekStarts.length - 2,
            externalId: `seed-organic-${weekIndex}-${i}`,
          },
        });
      }
    }

    if (!isCurrentWeek) {
      const flags: Array<{ type: TriggerType; description: string; resolvedAction?: string }> = [];
      if (isLowActivationWeek) {
        flags.push({
          type: TriggerType.low_activation,
          description: `Activation rate was ${activationRatePct}% this week, below the 20% floor.`,
          resolvedAction: "Flagged to product with the PostHog drop-off point on the onboarding step.",
        });
      }
      if (weekIndex === 6) {
        flags.push({
          type: TriggerType.channel_zero_streak,
          description: "reddit-ads has been at zero signups for 3 consecutive weeks.",
        });
      }
      for (const f of flags) {
        await prisma.interventionFlag.create({
          data: {
            reportId: report.id,
            triggerType: f.type,
            autoDetected: true,
            description: f.description,
            resolvedAction: f.resolvedAction ?? null,
          },
        });
      }

      await prisma.decision.createMany({
        data: [
          {
            reportId: report.id,
            text: "Post 2 additional Twitter threads on \"Graphs vs. Vector Databases\" this week.",
            isSpecific: true,
            isTimeBound: true,
            isFalsifiable: true,
          },
          {
            reportId: report.id,
            text: isLowActivationWeek
              ? "Ship the onboarding tooltip fix for the drop-off step by Wednesday and re-check activation rate next Monday."
              : "Pause reddit-ads spend this week and reallocate the budget to the blog content cluster.",
            isSpecific: true,
            isTimeBound: true,
            isFalsifiable: true,
          },
        ],
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
