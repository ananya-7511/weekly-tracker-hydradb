/// Discord bot API — total member count only (Section 5's own caveat: Discord
/// has no endpoint for "who joined between date X and Y," only a live
/// guildMemberAdd event stream, which needs an always-on bot process we don't
/// have). "New members this week" is therefore a net-change approximation
/// computed by the caller (src/lib/metrics/pullMetrics.ts) by diffing this
/// week's total against last week's — not a true join count. Same
/// mock-mode-until-configured pattern as src/lib/posthog.ts.
import type { PullResult } from "@/lib/posthog";

function isConfigured(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN);
}

export async function fetchGuildMemberCount(guildId: string): Promise<PullResult<{ totalMembers: number }>> {
  if (!isConfigured() || !guildId) return { available: false };
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return { available: false };
    const data = await res.json();
    if (typeof data.approximate_member_count !== "number") return { available: false };
    return { available: true, pulledAt: new Date(), data: { totalMembers: data.approximate_member_count } };
  } catch {
    return { available: false };
  }
}
