import { redirect } from "next/navigation";
import { getOrCreateCurrentWeekReport } from "@/lib/data/reportQueries";
import { formatWeekLabel } from "@/lib/dateWindow";

export default async function Home() {
  const report = await getOrCreateCurrentWeekReport();
  redirect(`/reports/${formatWeekLabel(report.weekStartDate)}`);
}
