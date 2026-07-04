-- AlterEnum
BEGIN;
CREATE TYPE "TriggerType_new" AS ENUM ('signups_down', 'channel_dominant', 'channel_zero_streak', 'blog_growing', 'mentions_search_flat', 'mentions_platform_zero_streak', 'organic_share_declining');
ALTER TABLE "InterventionFlag" ALTER COLUMN "triggerType" TYPE "TriggerType_new" USING ("triggerType"::text::"TriggerType_new");
ALTER TYPE "TriggerType" RENAME TO "TriggerType_old";
ALTER TYPE "TriggerType_new" RENAME TO "TriggerType";
DROP TYPE "TriggerType_old";
COMMIT;

-- AlterTable
ALTER TABLE "AppSettings" DROP COLUMN "signupEventName",
ADD COLUMN     "signupPagePath" TEXT;

-- AlterTable
ALTER TABLE "OutcomeMetrics" DROP COLUMN "activatedUsers",
DROP COLUMN "activatedUsersNaReason",
DROP COLUMN "activatedUsersPulledAt",
DROP COLUMN "activationRate",
ADD COLUMN     "primaryConversionRatePct" DOUBLE PRECISION,
ADD COLUMN     "totalUniqueVisitors" INTEGER,
ADD COLUMN     "totalUniqueVisitorsNaReason" TEXT,
ADD COLUMN     "totalUniqueVisitorsPulledAt" TIMESTAMP(3);
