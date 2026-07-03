"use client";

import { LineChart } from "@tremor/react";
import type { TrendPoint } from "@/lib/data/trendQueries";

/// A function prop (valueFormatter) can't cross the Server -> Client boundary
/// directly from an async Server Component — this tiny wrapper owns it locally.
export function ActivationRateChart({ data }: { data: TrendPoint[] }) {
  return (
    <LineChart
      className="mt-6 h-48"
      data={data}
      index="week"
      categories={["activationRatePct"]}
      colors={["violet"]}
      valueFormatter={(v: number) => `${v.toFixed(0)}%`}
      connectNulls
    />
  );
}
