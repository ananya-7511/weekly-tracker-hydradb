import { Card, Title, Text } from "@tremor/react";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { TRIGGER_CONFIG_DEFAULTS } from "@/lib/triggers/evaluate";
import { ActivationEventForm } from "./ActivationEventForm";
import { updateTriggerConfig, updateSignupPagePathAction, updateBrandedQueryTermsAction } from "./actions";

// Live config reads/writes — must never be statically prerendered at build time.
export const dynamic = "force-dynamic";

const CONFIG_LABELS: Record<string, string> = {
  channel_dominance_pct: "Channel dominance (%) — a channel above this share triggers 'double down'",
  zero_streak_weeks: "Zero-streak weeks — consecutive weeks at zero before flagging a channel to pause",
  mentions_search_lookback_days: "Mentions-vs-search lookback (days)",
  mentions_zero_streak_weeks: "Mentions platform zero-streak (weeks)",
  organic_share_lookback_weeks: "Organic share decline lookback (weeks)",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { activationStatus?: string; activationMessage?: string };
}) {
  const settings = await getAppSettings();
  const configRows = await prisma.triggerConfig.findMany();
  const configMap = new Map(configRows.map((r) => [r.key, r.value]));
  const activationFeedback =
    searchParams.activationStatus === "success" || searchParams.activationStatus === "error"
      ? { status: searchParams.activationStatus as "success" | "error", message: searchParams.activationMessage ?? "" }
      : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 flex flex-col gap-6">
      <Title>Settings</Title>
      <Text>Every threshold below is editable config, never hardcoded (FR-19) — the source doc expects this format to evolve.</Text>

      <Card>
        <Title>Event Taxonomy (Section 9.1)</Title>
        <form action={updateSignupPagePathAction} className="mt-4 flex flex-col gap-2">
          <label className="text-tremor-default font-medium text-tremor-content-emphasis">Sign-Up Page Path</label>
          <Text>
            A signup is counted whenever a visitor successfully reaches this page path (e.g. a post-signup
            confirmation page) — not a custom PostHog event.
          </Text>
          <input
            type="text"
            name="signupPagePath"
            defaultValue={settings.signupPagePath}
            placeholder="/sign-up"
            className="rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
          />
          <button type="submit" className="w-fit rounded-tremor-default border border-tremor-border px-3 py-1.5 text-tremor-default">
            Save
          </button>
        </form>

        <div className="mt-6 border-t border-tremor-border pt-4">
          <ActivationEventForm
            current={settings.activationEventName}
            lockedAt={settings.activationEventLockedAt ? settings.activationEventLockedAt.toISOString().slice(0, 10) : null}
            feedback={activationFeedback}
          />
        </div>
      </Card>

      <Card>
        <Title>Branded Query Terms (Open Question #9)</Title>
        <Text className="mt-1">Used to filter Google Search Console results — one term per line or comma-separated.</Text>
        <form action={updateBrandedQueryTermsAction} className="mt-4 flex flex-col gap-2">
          <textarea
            name="brandedQueryTerms"
            rows={4}
            defaultValue={settings.brandedQueryTerms.join("\n")}
            className="rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
          />
          <button type="submit" className="w-fit rounded-tremor-default border border-tremor-border px-3 py-1.5 text-tremor-default">
            Save
          </button>
        </form>
      </Card>

      <Card>
        <Title>Intervention Trigger Thresholds</Title>
        <form action={updateTriggerConfig} className="mt-4 flex flex-col gap-4">
          {Object.keys(TRIGGER_CONFIG_DEFAULTS).map((key) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-tremor-default font-medium text-tremor-content-emphasis">{CONFIG_LABELS[key] ?? key}</label>
              <input
                type="number"
                name={key}
                defaultValue={configMap.get(key) ?? TRIGGER_CONFIG_DEFAULTS[key as keyof typeof TRIGGER_CONFIG_DEFAULTS]}
                className="w-40 rounded-tremor-default border border-tremor-border px-2 py-1 text-tremor-default"
              />
            </div>
          ))}
          <button type="submit" className="w-fit rounded-tremor-default bg-tremor-brand px-4 py-2 text-tremor-default font-medium text-tremor-brand-inverted hover:bg-tremor-brand-emphasis">
            Save Thresholds
          </button>
        </form>
      </Card>
    </div>
  );
}
