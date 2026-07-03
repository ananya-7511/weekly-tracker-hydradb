import "dotenv/config";
import { ingestMentionsFromSlack } from "../src/lib/mentions/ingestMentions";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Running CommunityMentions Slack ingestion pass...");
  const summary = await ingestMentionsFromSlack();
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error("Mentions ingestion failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
