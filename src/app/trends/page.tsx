import Link from "next/link";
import { Card, Title, Text, AreaChart, LineChart, BarChart } from "@tremor/react";
import { getTrendData } from "@/lib/data/trendQueries";
import { listReportWeeks } from "@/lib/data/reportQueries";
import { ActivationRateChart } from "./ActivationRateChart";

// This page queries live report history on every request — it must never be
// statically prerendered at build time (Vercel's build step has no business
// baking in a snapshot of data that changes weekly, and attempting to prerender
// it hits the database at build time, which is what caused the Vercel build
// failure this was added to fix).
export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const [{ points, channelPoints, channelNames }, weeks] = await Promise.all([getTrendData(), listReportWeeks()]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col gap-6">
      <Title>Trends — Has This Actually Grown Since Week 1?</Title>
      <Text>
        Trend over absolute number, always (Section 9.6) — every chart here reads from stored weekly history, not a
        live re-pull.
      </Text>

      <Card>
        <Title>New Signups &amp; Activation Rate</Title>
        <AreaChart
          className="mt-4 h-64"
          data={points}
          index="week"
          categories={["newSignups"]}
          colors={["blue"]}
          connectNulls
        />
        <ActivationRateChart data={points} />
      </Card>

      <Card>
        <Title>Sign-Ups by Channel</Title>
        <BarChart
          className="mt-4 h-72"
          data={channelPoints}
          index="week"
          categories={channelNames}
          stack
        />
      </Card>

      <Card>
        <Title>Blog Organic Sessions</Title>
        <AreaChart className="mt-4 h-56" data={points} index="week" categories={["blogOrganicSessions"]} colors={["emerald"]} connectNulls />
      </Card>

      <Card>
        <Title>Branded Search Impressions vs. Total Brand Mentions</Title>
        <Text className="mt-1">
          FR-33 — the combined chart that makes the search-visibility correlation checkable at a glance: is the paid
          CommunityMentions engagement actually moving branded search?
        </Text>
        <LineChart
          className="mt-4 h-64"
          data={points}
          index="week"
          categories={["brandedImpressions", "totalMentions"]}
          colors={["indigo", "amber"]}
          connectNulls
        />
      </Card>

      <Card>
        <Title>Paid vs. Organic Mentions</Title>
        <Text className="mt-1">FR-33a — how much of visible brand activity is bought vs. earned, and is that ratio moving.</Text>
        <BarChart className="mt-4 h-64" data={points} index="week" categories={["paidMentions", "organicMentions"]} colors={["amber", "emerald"]} />
      </Card>

      <Card>
        <Title>Past Reports (FR-25)</Title>
        <Text className="mt-1">Each report remains viewable in its original published form — the narrative/decisions matter as much as the numbers.</Text>
        <ul className="mt-3 flex flex-col gap-1">
          {weeks.map((w) => (
            <li key={w.id}>
              <Link href={`/reports/${w.weekStartDate.toISOString().slice(0, 10)}`} className="text-tremor-brand hover:underline">
                {w.weekStartDate.toISOString().slice(0, 10)} — {w.status.replace(/_/g, " ")}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
