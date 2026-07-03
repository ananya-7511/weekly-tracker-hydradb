import "dotenv/config";
import { getOrCreateCurrentWeekReport } from "../src/lib/data/reportQueries";
import { pullAllAutomatedMetrics } from "../src/lib/metrics/pullMetrics";
import { evaluateTriggersForReport } from "../src/lib/triggers/runner";
import { prisma } from "../src/lib/prisma";

async function main() {
  const report = await getOrCreateCurrentWeekReport();
  console.log(`Pulling automated metrics for week ${report.weekStartDate.toISOString().slice(0, 10)}...`);
  const summary = await pullAllAutomatedMetrics(report.id);
  const triggers = await evaluateTriggersForReport(report.id);
  console.log(JSON.stringify({ summary, triggersDetected: triggers.length }, null, 2));
}

main()
  .catch((err) => {
    console.error("Weekly pull failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
