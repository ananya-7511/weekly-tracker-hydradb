-- AlterEnum
ALTER TYPE "MentionSourceMethod" ADD VALUE 'api_scraper';

-- AlterTable
ALTER TABLE "WeeklyExtras" DROP COLUMN "twitterImpressionsInfluencer",
DROP COLUMN "twitterImpressionsNaReason",
DROP COLUMN "twitterImpressionsOrganic",
ADD COLUMN     "discordNewMembers" INTEGER,
ADD COLUMN     "discordNewMembersNaReason" TEXT,
ADD COLUMN     "discordNewMembersPulledAt" TIMESTAMP(3),
ADD COLUMN     "twitterEngagement" INTEGER,
ADD COLUMN     "twitterFollowerCount" INTEGER,
ADD COLUMN     "twitterImpressions" INTEGER,
ADD COLUMN     "twitterMetricsNaReason" TEXT,
ADD COLUMN     "twitterMetricsPulledAt" TIMESTAMP(3);
