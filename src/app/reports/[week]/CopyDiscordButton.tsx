"use client";

import { useState } from "react";

/// FR-27: a copy-as-Discord-text fallback, since the source doc allows either
/// Slack or a Discord thread for distribution.
export function CopyDiscordButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="w-fit rounded-tremor-default border border-tremor-border bg-tremor-background px-3 py-1.5 text-tremor-default font-medium text-tremor-content-strong hover:bg-tremor-background-subtle"
    >
      {copied ? "Copied!" : "Copy as Discord-formatted text"}
    </button>
  );
}
