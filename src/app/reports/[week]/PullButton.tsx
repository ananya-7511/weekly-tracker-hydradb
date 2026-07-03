"use client";

import { useTransition } from "react";
import { pullMetricsAction } from "./actions";

export function PullButton({ reportId, weekStartIso }: { reportId: string; weekStartIso: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => pullMetricsAction(reportId, weekStartIso))}
      className="w-fit rounded-tremor-default border border-tremor-border bg-tremor-background px-3 py-1.5 text-tremor-default font-medium text-tremor-content-strong hover:bg-tremor-background-subtle disabled:opacity-50"
    >
      {isPending ? "Pulling…" : "Pull latest from PostHog / Search Console"}
    </button>
  );
}
