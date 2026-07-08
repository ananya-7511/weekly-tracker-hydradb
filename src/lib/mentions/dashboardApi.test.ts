import { describe, it, expect } from "vitest";
import { mapDashboardPostToRow } from "./dashboardApi";

describe("mapDashboardPostToRow", () => {
  it("maps a well-formed post, translating 'posted' status to 'posting'", () => {
    const row = mapDashboardPostToRow({
      date: "2026-07-08",
      postTitle: "Vector Databases & RAG Architecture Explained",
      subreddit: null,
      channel: "youtube",
      commentText: "moved to HydraDB since it's graph-based",
      postUrl: "https://www.youtube.com/watch?v=T4SZjYLcEB4",
      commentUrl: null,
      upvotes: 0,
      status: "posted",
    });
    expect(row).toEqual({
      postedDate: new Date("2026-07-08"),
      platform: "youtube",
      subreddit: null,
      postTitle: "Vector Databases & RAG Architecture Explained",
      postUrl: "https://www.youtube.com/watch?v=T4SZjYLcEB4",
      commentText: "moved to HydraDB since it's graph-based",
      commentUrl: null,
      threadUpvotes: 0,
      status: "posting",
      externalId: expect.stringMatching(/^mention-/),
    });
  });

  it("passes through 'verified' and 'removed' status unchanged", () => {
    const base = { date: "2026-07-08", channel: "reddit", status: "verified" };
    expect(mapDashboardPostToRow(base)?.status).toBe("verified");
    expect(mapDashboardPostToRow({ ...base, status: "removed" })?.status).toBe("removed");
  });

  it("derives the same externalId from a commentUrl regardless of other field differences", () => {
    const a = mapDashboardPostToRow({
      date: "2026-07-08",
      channel: "reddit",
      status: "posted",
      commentUrl: "https://reddit.com/r/graphdb/comments/abc/xyz",
      upvotes: 3,
    });
    const b = mapDashboardPostToRow({
      date: "2026-07-09",
      channel: "reddit",
      status: "verified",
      commentUrl: "https://reddit.com/r/graphdb/comments/abc/xyz",
      upvotes: 12,
    });
    expect(a?.externalId).toBe(b?.externalId);
  });

  it("returns null for an unparseable date", () => {
    expect(mapDashboardPostToRow({ date: "not-a-date", channel: "reddit", status: "verified" })).toBeNull();
  });

  it("returns null for an unrecognized channel", () => {
    expect(mapDashboardPostToRow({ date: "2026-07-08", channel: "discord", status: "verified" })).toBeNull();
  });

  it("returns null for an unrecognized status", () => {
    expect(mapDashboardPostToRow({ date: "2026-07-08", channel: "reddit", status: "pending" })).toBeNull();
  });
});
