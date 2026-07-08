import { describe, it, expect } from "vitest";
import { extractProfileJsonLd } from "./scrapeDoTwitter";

const PROFILE_PAGE_JSON_LD = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","url":"https://x.com/"}</script>` +
  `<script type="application/ld+json">{"@context":"http://schema.org","@type":"ProfilePage","mainEntity":{"@type":"Person","name":"HydraDB","interactionStatistic":[{"@type":"InteractionCounter","interactionType":"https://schema.org/FollowAction","name":"Follows","userInteractionCount":4420},{"@type":"InteractionCounter","interactionType":"https://schema.org/SubscribeAction","name":"Friends","userInteractionCount":1},{"@type":"InteractionCounter","interactionType":"https://schema.org/WriteAction","name":"Tweets","userInteractionCount":46}]}}</script>` +
  `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>`;

describe("extractProfileJsonLd", () => {
  it("finds the ProfilePage block among multiple JSON-LD blocks and reads follower/tweet counts", () => {
    const html = `<html><head>${PROFILE_PAGE_JSON_LD}</head><body></body></html>`;
    expect(extractProfileJsonLd(html)).toEqual({ followerCount: 4420, totalTweetCount: 46 });
  });

  it("returns null when no ProfilePage JSON-LD block is present", () => {
    const html = `<html><head><script type="application/ld+json">{"@type":"WebSite"}</script></head></html>`;
    expect(extractProfileJsonLd(html)).toBeNull();
  });

  it("returns null for a page with no JSON-LD at all", () => {
    expect(extractProfileJsonLd("<html><body>not found</body></html>")).toBeNull();
  });

  it("tolerates a malformed JSON-LD block by skipping it rather than throwing", () => {
    const html = `<script type="application/ld+json">{not valid json</script>${PROFILE_PAGE_JSON_LD}`;
    expect(extractProfileJsonLd(html)).toEqual({ followerCount: 4420, totalTweetCount: 46 });
  });

  it("returns nulls for stats that are missing from interactionStatistic", () => {
    const html = `<script type="application/ld+json">{"@type":"ProfilePage","mainEntity":{"interactionStatistic":[{"name":"Friends","userInteractionCount":1}]}}</script>`;
    expect(extractProfileJsonLd(html)).toEqual({ followerCount: null, totalTweetCount: null });
  });
});
