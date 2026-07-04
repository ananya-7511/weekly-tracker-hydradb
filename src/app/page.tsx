import { redirect } from "next/navigation";
import { getOrCreateCurrentWeekReport } from "@/lib/data/reportQueries";
import { formatWeekLabel } from "@/lib/dateWindow";

// Creates/reads this week's report on every visit — must never be statically
// prerendered at build time (that's what caused the Vercel build failure).
export const dynamic = "force-dynamic";

export default async function Home() {
  const report = await getOrCreateCurrentWeekReport();
  redirect(`/reports/${formatWeekLabel(report.weekStartDate)}`);
}
