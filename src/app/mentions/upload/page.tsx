import { Card, Title, Text } from "@tremor/react";
import { uploadMentionsCsv } from "./actions";

export default function MentionsUploadPage({
  searchParams,
}: {
  searchParams: { status?: string; message?: string };
}) {
  const feedback = searchParams.status === "success" || searchParams.status === "error" ? searchParams : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Title>Upload CommunityMentions CSV</Title>
      <Text className="mt-2">
        Fallback ingestion path (FR-31c) — use this if the agency&apos;s Slack drop is
        missed or Slack ingestion isn&apos;t configured. Expects the confirmed export
        columns: <code>Date, Channel, Subreddit, Post Title, Post URL, Comment, Comment
        URL, Thread Upvotes, Status</code>. Re-uploading the same export is safe — rows
        are deduped and a <code>posting → verified</code> status change updates the
        existing row instead of duplicating it.
      </Text>

      <Card className="mt-6">
        <form action={uploadMentionsCsv} className="flex flex-col gap-4">
          <input
            type="file"
            name="csvFile"
            accept=".csv,text/csv"
            required
            className="text-tremor-default"
          />
          <button
            type="submit"
            className="w-fit rounded-tremor-default bg-tremor-brand px-4 py-2 text-tremor-default font-medium text-tremor-brand-inverted hover:bg-tremor-brand-emphasis"
          >
            Upload &amp; Ingest
          </button>
          {feedback && (
            <p className={feedback.status === "success" ? "text-emerald-600 text-tremor-default" : "text-red-600 text-tremor-default"}>
              {feedback.message}
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
