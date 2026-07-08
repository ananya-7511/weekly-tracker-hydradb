import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ingestMentionsFromSlack, ingestMentionsFromDashboardApi } from "@/lib/mentions/ingestMentions";

export const maxDuration = 60;

/// Vercel Cron (daily — the agency's export is described as a "daily
/// verification report," so this polls more often than the weekly report
/// cadence itself, per FR-32's need for continuously-updated history).
/// Runs both ingestion paths every time — each is a no-op when unconfigured,
/// and externalId dedup means a mention picked up by both collapses to one row.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const slack = await ingestMentionsFromSlack();
  const dashboardApi = await ingestMentionsFromDashboardApi();
  revalidatePath("/");
  revalidatePath("/trends");

  return NextResponse.json({ ok: true, summary: { slack, dashboardApi } });
}
