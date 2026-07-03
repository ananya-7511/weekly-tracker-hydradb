import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ingestMentionsFromSlack } from "@/lib/mentions/ingestMentions";

export const maxDuration = 60;

/// Vercel Cron (daily — the agency's export is described as a "daily
/// verification report," so this polls more often than the weekly report
/// cadence itself, per FR-32's need for continuously-updated history).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const summary = await ingestMentionsFromSlack();
  revalidatePath("/");
  revalidatePath("/trends");

  return NextResponse.json({ ok: true, summary });
}
