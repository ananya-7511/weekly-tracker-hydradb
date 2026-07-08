import { describe, it, expect } from "vitest";
import { parseRelativePublishedDate, mapVideosToMentionItems, isRelevantVideo } from "./scrapeDoYoutube";

const NOW = new Date("2026-07-08T12:00:00Z");

describe("parseRelativePublishedDate", () => {
  it("parses days/weeks/months/years ago into an approximate absolute date", () => {
    expect(parseRelativePublishedDate("3 days ago", NOW)?.toISOString()).toBe("2026-07-05T12:00:00.000Z");
    expect(parseRelativePublishedDate("2 weeks ago", NOW)?.toISOString()).toBe("2026-06-24T12:00:00.000Z");
    expect(parseRelativePublishedDate("1 month ago", NOW)?.toISOString()).toBe("2026-06-08T12:00:00.000Z");
  });

  it("handles singular units (no trailing 's')", () => {
    expect(parseRelativePublishedDate("1 day ago", NOW)?.toISOString()).toBe("2026-07-07T12:00:00.000Z");
  });

  it("returns null for text that doesn't match the relative-age pattern", () => {
    expect(parseRelativePublishedDate("Streamed live", NOW)).toBeNull();
    expect(parseRelativePublishedDate("", NOW)).toBeNull();
  });
});

describe("mapVideosToMentionItems", () => {
  it("maps a well-formed video result to a mention item with a stable dedup key", () => {
    const items = mapVideosToMentionItems(
      [{ video_id: "abc123", link: "https://youtube.com/watch?v=abc123", title: "HydraDB vs Neo4j", description: "A comparison", published_date: "4 days ago" }],
      NOW
    );
    expect(items).toEqual([
      {
        externalId: "youtube-mention-abc123",
        postUrl: "https://youtube.com/watch?v=abc123",
        postTitle: "HydraDB vs Neo4j",
        commentText: "A comparison",
        postedDate: new Date("2026-07-04T12:00:00.000Z"),
      },
    ]);
  });

  it("skips a video missing an ID, link, or published date rather than guessing", () => {
    const items = mapVideosToMentionItems(
      [
        { video_id: "no-link", title: "Missing link" },
        { link: "https://youtube.com/watch?v=no-id", title: "Missing ID" },
        { video_id: "no-date", link: "https://youtube.com/watch?v=no-date", title: "Missing date" },
      ],
      NOW
    );
    expect(items).toEqual([]);
  });

  it("skips a video whose published_date can't be parsed", () => {
    const items = mapVideosToMentionItems(
      [{ video_id: "live1", link: "https://youtube.com/watch?v=live1", title: "Live now", published_date: "Streamed live" }],
      NOW
    );
    expect(items).toEqual([]);
  });

  it("returns an empty array for no videos", () => {
    expect(mapVideosToMentionItems([], NOW)).toEqual([]);
  });
});

describe("isRelevantVideo", () => {
  it("matches when a branded term appears in the title regardless of spacing/case", () => {
    expect(isRelevantVideo({ title: "HydraDB vs Neo4j" }, ["hydradb", "hydra db"])).toBe(true);
    expect(isRelevantVideo({ title: "An intro to Hydra DB" }, ["hydradb"])).toBe(true);
    expect(isRelevantVideo({ title: "hydra-db in 10 minutes" }, ["hydradb"])).toBe(true);
  });

  it("matches when the term is only in the description", () => {
    expect(isRelevantVideo({ title: "Graph databases", description: "featuring HydraDB" }, ["hydradb"])).toBe(true);
  });

  it("rejects a video that only fuzzily matched on YouTube's side but doesn't contain the term", () => {
    expect(isRelevantVideo({ title: "Hydra: Column-oriented Postgres", description: "hydra.so" }, ["hydradb", "hydra db"])).toBe(
      false
    );
    expect(isRelevantVideo({ title: "Hydra-Activate Original Mix" }, ["hydradb", "hydra db"])).toBe(false);
  });

  it("treats missing title/description as empty rather than throwing", () => {
    expect(isRelevantVideo({}, ["hydradb"])).toBe(false);
  });
});
