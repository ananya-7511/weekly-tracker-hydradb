import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, Title, Text } from "@tremor/react";
import { getReportByWeekStart } from "@/lib/data/reportQueries";
import { formatWeekLabel } from "@/lib/dateWindow";
import { computeSplit } from "@/lib/data/mentionsQueries";
import { findMissingFields } from "@/lib/reportLifecycle";
import { formatDiscordSummaryText } from "@/lib/distribution";
import { MentionBadge, StatusBadge } from "@/components/MentionBadge";
import { PullButton } from "./PullButton";
import { CopyDiscordButton } from "./CopyDiscordButton";
import * as actions from "./actions";

// Live report data, mutated constantly via the Server Actions below — must
// never be statically prerendered or cached.
export const dynamic = "force-dynamic";

function relativeTime(date: Date | null): string {
  if (!date) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function NaField({
  label,
  name,
  defaultValue,
  naDefaultValue,
  sourceCaption,
}: {
  label: string;
  name: string;
  defaultValue: number | null;
  naDefaultValue: string | null;
  sourceCaption?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-tremor-default font-medium text-tremor-content-emphasis">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          name={name}
          defaultValue={defaultValue ?? ""}
          placeholder="value"
          className="w-32 rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
        />
        <span className="text-xs text-tremor-content-subtle">or</span>
        <input
          type="text"
          name={`${name}NaReason`}
          defaultValue={naDefaultValue ?? ""}
          placeholder="N/A — reason"
          className="min-w-[200px] flex-1 rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
        />
      </div>
      {sourceCaption && <span className="text-xs text-tremor-content-subtle">{sourceCaption}</span>}
    </div>
  );
}

export default async function ReportPage({ params }: { params: { week: string } }) {
  const report = await getReportByWeekStart(params.week);
  if (!report) notFound();

  const weekStartIso = formatWeekLabel(report.weekStartDate);
  const missingFields = findMissingFields(report);
  const split = computeSplit(report.brandMentions);
  const activeFlags = report.interventionFlags.filter((f) => f.autoDetected);
  const discordText = formatDiscordSummaryText(report);

  const saveOutcome = actions.saveOutcomeMetrics.bind(null, report.id, weekStartIso);
  const saveExtras = actions.saveWeeklyExtras.bind(null, report.id, weekStartIso);
  const saveSearch = actions.saveSearchVisibility.bind(null, report.id, weekStartIso);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Title>
            Week of {report.weekStartDate.toISOString().slice(0, 10)} – {report.weekEndDate.toISOString().slice(0, 10)}
          </Title>
          {missingFields.length > 0 && (
            <Text className="mt-1 text-tremor-content-subtle">
              Still blank this week: {missingFields.join(", ")}
            </Text>
          )}
        </div>
        <div className="flex items-center gap-3">
          <CopyDiscordButton text={discordText} />
          <PullButton reportId={report.id} weekStartIso={weekStartIso} />
        </div>
      </div>

      {activeFlags.length > 0 && (
        <Card className="border-l-4 border-l-amber-500">
          <Title>Intervention Triggers ({activeFlags.length})</Title>
          <Text className="mt-1">
            Auto-detected from stored history — informational, not a publish blocker (FR-20). A flag with no
            action logged stays visible in history as unaddressed.
          </Text>
          <ul className="mt-3 flex flex-col gap-3">
            {activeFlags.map((f) => (
              <li key={f.id} className="rounded-tremor-default bg-amber-50 p-3">
                <p className="text-tremor-default">{f.description}</p>
                <form action={actions.resolveFlag.bind(null, f.id, weekStartIso)} className="mt-2 flex gap-2">
                  <input
                    type="text"
                    name="resolvedAction"
                    defaultValue={f.resolvedAction ?? ""}
                    placeholder="What action addresses this? (link to a decision below)"
                    className="flex-1 rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
                  />
                  <button type="submit" className="rounded-tremor-default border border-tremor-border px-3 py-1 text-tremor-default">
                    Save
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Title>Layer 1 — Outcome Metrics</Title>
        <Text className="mt-1">
          Primary Conversion Rate — out of total unique website visitors this week, how many completed sign up.
          Positive, consistent WoW growth. (Activation Rate removed for now — revisit later.)
        </Text>
        <form action={saveOutcome} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NaField
            label="New Signups"
            name="newSignups"
            defaultValue={report.outcomeMetrics?.newSignups ?? null}
            naDefaultValue={report.outcomeMetrics?.newSignupsNaReason ?? null}
            sourceCaption={
              report.outcomeMetrics?.newSignupsPulledAt
                ? `via ${report.outcomeMetrics.newSignupsSource ?? "PostHog"}, pulled ${relativeTime(report.outcomeMetrics.newSignupsPulledAt)}`
                : undefined
            }
          />
          <NaField
            label="Total Unique Website Visitors"
            name="totalUniqueVisitors"
            defaultValue={report.outcomeMetrics?.totalUniqueVisitors ?? null}
            naDefaultValue={report.outcomeMetrics?.totalUniqueVisitorsNaReason ?? null}
            sourceCaption={
              report.outcomeMetrics?.totalUniqueVisitorsPulledAt
                ? `pulled ${relativeTime(report.outcomeMetrics.totalUniqueVisitorsPulledAt)}`
                : undefined
            }
          />
          <div className="sm:col-span-2 text-tremor-default text-tremor-content">
            Primary Conversion Rate:{" "}
            <strong>{report.outcomeMetrics?.primaryConversionRatePct != null ? `${report.outcomeMetrics.primaryConversionRatePct.toFixed(1)}%` : "—"}</strong>
            {"  ·  "}
            WoW Growth: <strong>{report.outcomeMetrics?.wowSignupGrowthPct != null ? `${report.outcomeMetrics.wowSignupGrowthPct.toFixed(1)}%` : "—"}</strong>
            {" "}(computed automatically, never re-entered by hand — FR-7)
          </div>
          <button type="submit" className="w-fit rounded-tremor-default bg-tremor-brand px-4 py-2 text-tremor-default font-medium text-tremor-brand-inverted hover:bg-tremor-brand-emphasis">
            Save Outcome Metrics
          </button>
        </form>
      </Card>

      <Card>
        <Title>Layer 2 — Sign-Ups by Channel</Title>
        <Text className="mt-1">A channel at zero for 3 straight weeks should be paused (auto-flagged above once it happens).</Text>
        <div className="mt-4 flex flex-col gap-4">
          {report.channelMetrics.map((ch) => (
            <form
              key={ch.id}
              action={actions.saveChannelMetric.bind(null, report.id, weekStartIso, ch.utmSource)}
              className="flex flex-wrap items-center gap-2 border-b border-tremor-border pb-3 last:border-none"
            >
              <span className="w-32 shrink-0 text-tremor-default font-medium">{ch.utmSource}</span>
              <input
                type="number"
                name={`signups-${ch.utmSource}`}
                defaultValue={ch.signups ?? ""}
                placeholder="value"
                className="w-28 rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
              />
              <span className="text-xs text-tremor-content-subtle">or</span>
              <input
                type="text"
                name={`naReason-${ch.utmSource}`}
                defaultValue={ch.naReason ?? ""}
                placeholder="N/A — reason"
                className="min-w-[180px] flex-1 rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
              />
              <button type="submit" className="rounded-tremor-default border border-tremor-border px-3 py-1 text-tremor-default">
                Save
              </button>
            </form>
          ))}
        </div>
      </Card>

      <Card>
        <Title>Layer 2 — Content, Twitter, Blog, Discord</Title>
        <form action={saveExtras} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className="text-tremor-default font-medium text-tremor-content-emphasis">Top DevRel Content Piece</label>
            <input
              type="text"
              name="topDevrelContentFreetext"
              defaultValue={report.weeklyExtras?.topDevrelContentFreetext ?? ""}
              placeholder="e.g. Tutorial: Graphs vs. Vector Databases (blog post)"
              className="rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
            />
            <input
              type="url"
              name="topDevrelContentUrl"
              defaultValue={report.weeklyExtras?.topDevrelContentUrl ?? ""}
              placeholder="Link"
              className="rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
            />
            <input
              type="text"
              name="topDevrelContentNaReason"
              defaultValue={report.weeklyExtras?.topDevrelContentNaReason ?? ""}
              placeholder="N/A — reason (only if leaving the above blank)"
              className="rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
            />
            <span className="text-xs text-tremor-content-subtle">
              Manual freetext in Phase 1 — real Content Tracking Dashboard integration is a Phase 2 item (Section 3).
            </span>
          </div>

          <NaField
            label="Twitter Follower Count"
            name="twitterFollowerCount"
            defaultValue={report.weeklyExtras?.twitterFollowerCount ?? null}
            naDefaultValue={report.weeklyExtras?.twitterMetricsNaReason ?? null}
            sourceCaption={
              report.weeklyExtras?.twitterMetricsPulledAt
                ? `via scraper, pulled ${relativeTime(report.weeklyExtras.twitterMetricsPulledAt)}`
                : undefined
            }
          />
          <NaField
            label="Twitter Impressions"
            name="twitterImpressions"
            defaultValue={report.weeklyExtras?.twitterImpressions ?? null}
            naDefaultValue={report.weeklyExtras?.twitterImpressionsNaReason ?? null}
            sourceCaption="manual only — not exposed by the scraper, native Twitter Analytics required"
          />
          <NaField
            label="Twitter Engagement (likes + retweets + replies + quotes)"
            name="twitterEngagement"
            defaultValue={report.weeklyExtras?.twitterEngagement ?? null}
            naDefaultValue={report.weeklyExtras?.twitterMetricsNaReason ?? null}
            sourceCaption={
              report.weeklyExtras?.twitterMetricsPulledAt
                ? `via scraper, pulled ${relativeTime(report.weeklyExtras.twitterMetricsPulledAt)}`
                : undefined
            }
          />
          <div className="flex flex-col gap-1">
            <label className="text-tremor-default font-medium text-tremor-content-emphasis">Top Tweet URL</label>
            <input
              type="url"
              name="topTweetUrl"
              defaultValue={report.weeklyExtras?.topTweetUrl ?? ""}
              className="rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
            />
          </div>
          <NaField
            label="Blog Organic Sessions"
            name="blogOrganicSessions"
            defaultValue={report.weeklyExtras?.blogOrganicSessions ?? null}
            naDefaultValue={report.weeklyExtras?.blogOrganicSessionsNaReason ?? null}
            sourceCaption={
              report.weeklyExtras?.blogOrganicSessionsPulledAt
                ? `via ${report.weeklyExtras.blogOrganicSessionsSource ?? "PostHog"}, pulled ${relativeTime(report.weeklyExtras.blogOrganicSessionsPulledAt)}`
                : undefined
            }
          />
          <NaField
            label="Discord Active Members"
            name="discordActiveMembers"
            defaultValue={report.weeklyExtras?.discordActiveMembers ?? null}
            naDefaultValue={report.weeklyExtras?.discordActiveMembersNaReason ?? null}
          />
          <NaField
            label="Discord Total Members"
            name="discordTotalMembers"
            defaultValue={report.weeklyExtras?.discordTotalMembers ?? null}
            naDefaultValue={report.weeklyExtras?.discordTotalMembersNaReason ?? null}
            sourceCaption={
              report.weeklyExtras?.discordNewMembersPulledAt
                ? `via Discord API, pulled ${relativeTime(report.weeklyExtras.discordNewMembersPulledAt)}`
                : undefined
            }
          />
          <NaField
            label="Discord New Members This Week (net change)"
            name="discordNewMembers"
            defaultValue={report.weeklyExtras?.discordNewMembers ?? null}
            naDefaultValue={report.weeklyExtras?.discordNewMembersNaReason ?? null}
            sourceCaption={
              report.weeklyExtras?.discordNewMembersPulledAt
                ? `pulled ${relativeTime(report.weeklyExtras.discordNewMembersPulledAt)}`
                : undefined
            }
          />
          {report.weeklyExtras?.discordActiveMembers != null && report.weeklyExtras?.discordTotalMembers ? (
            <div className="sm:col-span-2 text-tremor-default text-tremor-content">
              Active %: <strong>{((report.weeklyExtras.discordActiveMembers / report.weeklyExtras.discordTotalMembers) * 100).toFixed(1)}%</strong>{" "}
              (target &gt;40%; &lt;20% signals a passive audience)
            </div>
          ) : null}

          <button type="submit" className="sm:col-span-2 w-fit rounded-tremor-default bg-tremor-brand px-4 py-2 text-tremor-default font-medium text-tremor-brand-inverted hover:bg-tremor-brand-emphasis">
            Save
          </button>
        </form>
      </Card>

      <Card>
        <Title>Layer 4 — Search Visibility</Title>
        <form action={saveSearch} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NaField
            label="Branded Search Impressions"
            name="brandedImpressions"
            defaultValue={report.searchVisibility?.brandedImpressions ?? null}
            naDefaultValue={report.searchVisibility?.naReason ?? null}
            sourceCaption={report.searchVisibility?.pulledAt ? `via Search Console, pulled ${relativeTime(report.searchVisibility.pulledAt)}` : undefined}
          />
          <div className="flex flex-col gap-1">
            <label className="text-tremor-default font-medium text-tremor-content-emphasis">Branded Search Clicks</label>
            <input
              type="number"
              name="brandedClicks"
              defaultValue={report.searchVisibility?.brandedClicks ?? ""}
              className="rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-tremor-default font-medium text-tremor-content-emphasis">Avg Position</label>
            <input
              type="number"
              step="any"
              name="avgPosition"
              defaultValue={report.searchVisibility?.avgPosition ?? ""}
              className="rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
            />
          </div>
          {report.searchVisibility?.newTop20Queries && report.searchVisibility.newTop20Queries.length > 0 && (
            <div className="sm:col-span-3 text-tremor-default">
              New queries entering top 20: {report.searchVisibility.newTop20Queries.join(", ")}
            </div>
          )}
          <button type="submit" className="sm:col-span-3 w-fit rounded-tremor-default bg-tremor-brand px-4 py-2 text-tremor-default font-medium text-tremor-brand-inverted hover:bg-tremor-brand-emphasis">
            Save
          </button>
        </form>

        <div className="mt-6 border-t border-tremor-border pt-4">
          <Title>Paid vs. Organic Mentions This Week</Title>
          <Text className="mt-1">
            {split.paidVerifiedCount} paid (verified) / {split.organicCount} organic
            {split.paidSharePct !== null ? ` — ${split.paidSharePct.toFixed(0)}% paid / ${split.organicSharePct!.toFixed(0)}% organic` : ""}
          </Text>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-tremor-default">
              <thead>
                <tr className="border-b border-tremor-border text-tremor-content">
                  <th className="py-1 pr-3">Source</th>
                  <th className="py-1 pr-3">Platform</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Post</th>
                  <th className="py-1 pr-3">Upvotes</th>
                </tr>
              </thead>
              <tbody>
                {report.brandMentions.map((m) => (
                  <tr key={m.id} className="border-b border-tremor-border last:border-none">
                    <td className="py-1 pr-3">
                      <MentionBadge source={m.mentionSource} />
                    </td>
                    <td className="py-1 pr-3 capitalize">{m.platform}</td>
                    <td className="py-1 pr-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="py-1 pr-3">
                      {m.postUrl ? (
                        <a href={m.postUrl} target="_blank" rel="noreferrer" className="text-tremor-brand hover:underline">
                          {m.postTitle ?? m.postUrl}
                        </a>
                      ) : (
                        m.postTitle ?? "—"
                      )}
                    </td>
                    <td className="py-1 pr-3">{m.threadUpvotes ?? "—"}</td>
                  </tr>
                ))}
                {report.brandMentions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-tremor-content-subtle">
                      No mentions logged for this week yet — use <Link href="/mentions/upload" className="text-tremor-brand hover:underline">Upload Mentions CSV</Link> or wait for the next daily ingestion pass (dashboard API + Slack).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

    </div>
  );
}
