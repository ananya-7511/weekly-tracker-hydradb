-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "discordGuildId" TEXT;

-- AlterTable
ALTER TABLE "WeeklyExtras" DROP COLUMN "discordNaReason",
ADD COLUMN     "discordActiveMembersNaReason" TEXT,
ADD COLUMN     "discordTotalMembersNaReason" TEXT;
