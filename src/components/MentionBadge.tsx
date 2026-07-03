/// FR-33b: every mention row, everywhere, must show its mention_source at a
/// glance — never only inferable from which filter or chart it's under.
export function MentionBadge({ source }: { source: "paid" | "organic" }) {
  const isPaid = source === "paid";
  return (
    <span
      className={
        "inline-flex items-center rounded-tremor-full px-2 py-0.5 text-xs font-medium " +
        (isPaid ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")
      }
    >
      {isPaid ? "Paid · CommunityMentions" : "Organic · self-reported"}
    </span>
  );
}

export function StatusBadge({ status }: { status: "verified" | "posting" | "removed" | null }) {
  if (!status) return <span className="text-tremor-content-subtle text-xs">—</span>;
  const styles: Record<string, string> = {
    verified: "bg-emerald-100 text-emerald-800",
    posting: "bg-yellow-100 text-yellow-800",
    removed: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center rounded-tremor-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
