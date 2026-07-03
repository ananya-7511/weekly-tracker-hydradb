import { describe, it, expect } from "vitest";
import { parseCommunityMentionsCsv } from "./csvParser";

const HEADER = "Date,Channel,Subreddit,Post Title,Post URL,Comment,Comment URL,Thread Upvotes,Status";

describe("parseCommunityMentionsCsv", () => {
  it("parses a well-formed verified Reddit row", () => {
    const csv = `${HEADER}\n2026-06-04,Reddit,r/databases,"Best graph DB?",https://reddit.com/r/databases/thread1,"Try HydraDB, it handles this well",https://reddit.com/r/databases/thread1/comment1,42,verified`;
    const result = parseCommunityMentionsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      platform: "reddit",
      subreddit: "r/databases",
      status: "verified",
      threadUpvotes: 42,
      commentText: "Try HydraDB, it handles this well",
    });
  });

  it("handles quoted fields containing embedded commas and quotes", () => {
    const csv = `${HEADER}\n2026-06-05,Medium,,"Article, with a comma",https://medium.com/post,"He said ""great tool""",https://medium.com/post#comment,,posting`;
    const result = parseCommunityMentionsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].postTitle).toBe("Article, with a comma");
    expect(result.rows[0].commentText).toBe('He said "great tool"');
    expect(result.rows[0].threadUpvotes).toBeNull();
  });

  it("normalizes Channel/Status case and whitespace", () => {
    const csv = `${HEADER}\n2026-06-06, YOUTUBE ,,Video,https://youtube.com/v1,Nice video,https://youtube.com/v1?comment=1,,  Verified  `;
    const result = parseCommunityMentionsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].platform).toBe("youtube");
    expect(result.rows[0].status).toBe("verified");
  });

  it("rejects a row with an unrecognized Status rather than guessing", () => {
    const csv = `${HEADER}\n2026-06-04,Reddit,r/databases,Title,https://reddit.com/t1,Comment,https://reddit.com/t1/c1,10,live`;
    const result = parseCommunityMentionsCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toMatch(/Unrecognized Status/);
  });

  it("rejects a row with an unparseable Date", () => {
    const csv = `${HEADER}\nnot-a-date,Reddit,r/databases,Title,https://reddit.com/t1,Comment,https://reddit.com/t1/c1,10,verified`;
    const result = parseCommunityMentionsCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].reason).toMatch(/Unparseable Date/);
  });

  it("flags a CSV missing expected columns instead of guessing a mapping", () => {
    const csv = "Date,Channel,Status\n2026-06-04,Reddit,verified";
    const result = parseCommunityMentionsCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].reason).toMatch(/Missing expected column/);
  });

  it("produces a stable dedup key across repeated parses of the same row", () => {
    const csv = `${HEADER}\n2026-06-04,Reddit,r/databases,Title,https://reddit.com/t1,Comment,https://reddit.com/t1/c1,10,verified`;
    const first = parseCommunityMentionsCsv(csv).rows[0].externalId;
    const second = parseCommunityMentionsCsv(csv).rows[0].externalId;
    expect(first).toBe(second);
  });

  it("skips blank rows without erroring", () => {
    const csv = `${HEADER}\n2026-06-04,Reddit,r/databases,Title,https://reddit.com/t1,Comment,https://reddit.com/t1/c1,10,verified\n,,,,,,,,`;
    const result = parseCommunityMentionsCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });
});
