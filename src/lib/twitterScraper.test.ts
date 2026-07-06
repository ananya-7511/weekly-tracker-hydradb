import { describe, it, expect } from "vitest";
import { aggregateAccountHealth, mapMentionsToItems } from "./twitterScraper";

describe("aggregateAccountHealth", () => {
  it("sums engagement across likes, retweets, replies, quotes, and bookmarks", () => {
    const result = aggregateAccountHealth([
      {
        id: "1",
        url: "https://x.com/Hydra_DB/status/1",
        text: "tweet 1",
        likeCount: 10,
        retweetCount: 2,
        replyCount: 1,
        quoteCount: 0,
        bookmarkCount: 3,
        createdAt: "2026-06-01T00:00:00Z",
        author: { userName: "Hydra_DB", followers: 1500 },
      },
      {
        id: "2",
        url: "https://x.com/Hydra_DB/status/2",
        text: "tweet 2",
        likeCount: 50,
        retweetCount: 5,
        replyCount: 2,
        quoteCount: 1,
        bookmarkCount: 0,
        createdAt: "2026-06-02T00:00:00Z",
        author: { userName: "Hydra_DB", followers: 1510 },
      },
    ]);
    expect(result.engagement).toBe(16 + 58);
    expect(result.topTweetUrl).toBe("https://x.com/Hydra_DB/status/2");
    expect(result.followerCount).toBe(1500);
  });

  it("returns nulls/zero for an empty tweet list rather than throwing", () => {
    expect(aggregateAccountHealth([])).toEqual({ followerCount: null, engagement: 0, topTweetUrl: null });
  });

  it("tolerates missing engagement fields on a tweet", () => {
    const result = aggregateAccountHealth([
      { id: "1", url: "https://x.com/Hydra_DB/status/1", text: "t", createdAt: "2026-06-01T00:00:00Z" },
    ]);
    expect(result.engagement).toBe(0);
    expect(result.followerCount).toBeNull();
  });
});

describe("mapMentionsToItems", () => {
  it("maps raw tweets to mention items with a stable dedup key", () => {
    const items = mapMentionsToItems([
      { id: "42", url: "https://x.com/someone/status/42", text: "Loving HydraDB", createdAt: "2026-06-03T12:00:00Z" },
    ]);
    expect(items).toEqual([
      {
        externalId: "twitter-mention-42",
        postUrl: "https://x.com/someone/status/42",
        commentText: "Loving HydraDB",
        postedDate: new Date("2026-06-03T12:00:00Z"),
      },
    ]);
  });

  it("returns an empty array for no tweets", () => {
    expect(mapMentionsToItems([])).toEqual([]);
  });
});
