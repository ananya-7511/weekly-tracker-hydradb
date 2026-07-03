import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getOrCreateCurrentWeekReport } from "@/lib/data/reportQueries";
import { pullAllAutomatedMetrics } from "@/lib/metrics/pullMetrics";
import { evaluateTriggersForReport } from "@/lib/triggers/runner";

export const maxDuration = 60;

/// Vercel Cron (weekly, Monday early UTC — see vercel.json): ensures this
/// week's WeeklyReport draft exists (FR-1) so Ananya opens the tracker Monday
/// morning to mostly-pre-populated numbers rather than a blank form (Goal 1),
/// then auto-pulls Layers 1/2/4-search and re-evaluates triggers. Same
/// CRON_SECRET Bearer-token guard as the companion Content Tracking
/// Dashboard's /api/cron/ingest.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const report = await getOrCreateCurrentWeekReport();
  const pullSummary = await pullAllAutomatedMetrics(report.id);
  const triggers = await evaluateTriggersForReport(report.id);

  revalidatePath("/");
  revalidatePath("/trends");

  return NextResponse.json({ ok: true, reportId: report.id, pullSummary, triggersDetected: triggers.length });
}
