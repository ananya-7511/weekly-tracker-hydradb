-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('draft', 'ready_for_decisions', 'published');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('source_quality', 'time_to_activation', 'organic_impressions', 'churned_inactive');

-- CreateEnum
CREATE TYPE "MentionSource" AS ENUM ('paid', 'organic');

-- CreateEnum
CREATE TYPE "MentionPlatform" AS ENUM ('reddit', 'youtube', 'medium', 'linkedin', 'x', 'discord');

-- CreateEnum
CREATE TYPE "MentionStatus" AS ENUM ('verified', 'posting', 'removed');

-- CreateEnum
CREATE TYPE "MentionSourceMethod" AS ENUM ('slack_ingest', 'manual_csv', 'manual_entry');

-- CreateEnum
CREATE TYPE "Brand" AS ENUM ('hydradb', 'skillmake');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('signups_down', 'low_activation', 'channel_dominant', 'channel_zero_streak', 'blog_growing', 'mentions_search_flat', 'mentions_platform_zero_streak', 'organic_share_declining');

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'draft',
    "createdBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeMetrics" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "newSignups" INTEGER,
    "newSignupsNaReason" TEXT,
    "newSignupsPulledAt" TIMESTAMP(3),
    "newSignupsSource" TEXT,
    "activatedUsers" INTEGER,
    "activatedUsersNaReason" TEXT,
    "activatedUsersPulledAt" TIMESTAMP(3),
    "activationRate" DOUBLE PRECISION,
    "wowSignupGrowthPct" DOUBLE PRECISION,

    CONSTRAINT "OutcomeMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelMetrics" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL,
    "signups" INTEGER,
    "naReason" TEXT,
    "pulledAt" TIMESTAMP(3),

    CONSTRAINT "ChannelMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyExtras" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "topDevrelContentFreetext" TEXT,
    "topDevrelContentUrl" TEXT,
    "topDevrelContentNaReason" TEXT,
    "twitterImpressionsOrganic" INTEGER,
    "twitterImpressionsInfluencer" INTEGER,
    "twitterImpressionsNaReason" TEXT,
    "topTweetUrl" TEXT,
    "blogOrganicSessions" INTEGER,
    "blogOrganicSessionsNaReason" TEXT,
    "blogOrganicSessionsPulledAt" TIMESTAMP(3),
    "blogOrganicSessionsSource" TEXT,
    "discordActiveMembers" INTEGER,
    "discordTotalMembers" INTEGER,
    "discordNaReason" TEXT,

    CONSTRAINT "WeeklyExtras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalNote" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "signalType" "SignalType" NOT NULL,
    "note" TEXT,
    "value" DOUBLE PRECISION,
    "needsFollowup" BOOLEAN NOT NULL DEFAULT false,
    "naReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchVisibilityMetrics" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "brandedImpressions" INTEGER,
    "brandedClicks" INTEGER,
    "avgPosition" DOUBLE PRECISION,
    "newTop20Queries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "naReason" TEXT,
    "pulledAt" TIMESTAMP(3),

    CONSTRAINT "SearchVisibilityMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandMention" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "mentionSource" "MentionSource" NOT NULL,
    "platform" "MentionPlatform" NOT NULL,
    "subreddit" TEXT,
    "postTitle" TEXT,
    "postUrl" TEXT,
    "commentText" TEXT,
    "commentUrl" TEXT,
    "status" "MentionStatus",
    "threadUpvotes" INTEGER,
    "needsFollowup" BOOLEAN NOT NULL DEFAULT false,
    "loggedBy" TEXT,
    "postedDate" TIMESTAMP(3) NOT NULL,
    "sourceMethod" "MentionSourceMethod" NOT NULL,
    "brand" "Brand",
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionFlag" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "triggerType" "TriggerType" NOT NULL,
    "autoDetected" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL,
    "resolvedAction" TEXT,
    "linkedDecisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterventionFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isSpecific" BOOLEAN NOT NULL DEFAULT false,
    "isTimeBound" BOOLEAN NOT NULL DEFAULT false,
    "isFalsifiable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerConfig" (
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriggerConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "signupEventName" TEXT,
    "activationEventName" TEXT,
    "activationEventLockedAt" TIMESTAMP(3),
    "brandedQueryTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentionsIngestionCursor" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastSyncedTs" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentionsIngestionCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_weekStartDate_key" ON "WeeklyReport"("weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklyReport_status_idx" ON "WeeklyReport"("status");

-- CreateIndex
CREATE INDEX "WeeklyReport_weekStartDate_idx" ON "WeeklyReport"("weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "OutcomeMetrics_reportId_key" ON "OutcomeMetrics"("reportId");

-- CreateIndex
CREATE INDEX "ChannelMetrics_utmSource_idx" ON "ChannelMetrics"("utmSource");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMetrics_reportId_utmSource_key" ON "ChannelMetrics"("reportId", "utmSource");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyExtras_reportId_key" ON "WeeklyExtras"("reportId");

-- CreateIndex
CREATE INDEX "SignalNote_signalType_idx" ON "SignalNote"("signalType");

-- CreateIndex
CREATE UNIQUE INDEX "SearchVisibilityMetrics_reportId_key" ON "SearchVisibilityMetrics"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandMention_externalId_key" ON "BrandMention"("externalId");

-- CreateIndex
CREATE INDEX "BrandMention_mentionSource_idx" ON "BrandMention"("mentionSource");

-- CreateIndex
CREATE INDEX "BrandMention_platform_idx" ON "BrandMention"("platform");

-- CreateIndex
CREATE INDEX "BrandMention_postedDate_idx" ON "BrandMention"("postedDate");

-- CreateIndex
CREATE INDEX "BrandMention_status_idx" ON "BrandMention"("status");

-- CreateIndex
CREATE INDEX "InterventionFlag_triggerType_idx" ON "InterventionFlag"("triggerType");

-- AddForeignKey
ALTER TABLE "OutcomeMetrics" ADD CONSTRAINT "OutcomeMetrics_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMetrics" ADD CONSTRAINT "ChannelMetrics_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyExtras" ADD CONSTRAINT "WeeklyExtras_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalNote" ADD CONSTRAINT "SignalNote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchVisibilityMetrics" ADD CONSTRAINT "SearchVisibilityMetrics_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMention" ADD CONSTRAINT "BrandMention_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionFlag" ADD CONSTRAINT "InterventionFlag_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
