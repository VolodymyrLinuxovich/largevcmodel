import { describe, expect, it } from "vitest";
import { buildCitationMap, canonicalizeUrl, citationLabel, dedupeSources } from "@/lib/domain/sources";
import { FIXED_ACCESS_DATE } from "@/lib/demo/fixtures";

describe("source provenance utilities", () => {
  it("canonicalizes and deduplicates equivalent URLs", () => {
    const sources = dedupeSources([
      {
        title: "Source A",
        url: "https://www.example.com/path/?b=2&a=1#fragment",
        accessedAt: FIXED_ACCESS_DATE,
        sourceType: "news",
        origin: "mock",
        supportsClaims: ["Claim A"],
      },
      {
        title: "Source B",
        url: "https://example.com/path/?a=1&b=2",
        accessedAt: FIXED_ACCESS_DATE,
        sourceType: "news",
        origin: "mock",
        supportsClaims: ["Claim B"],
      },
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0].supportsClaims).toEqual(["Claim A", "Claim B"]);
    expect(canonicalizeUrl(sources[0].url)).toBe("https://example.com/path?a=1&b=2");
  });

  it("maps citation labels deterministically", () => {
    const citationMap = buildCitationMap([
      { id: "source-a", title: "A", url: "/demo-sources/a", sourceType: "company", origin: "mock" },
      { id: "source-b", title: "B", url: "/demo-sources/b", sourceType: "funding", origin: "mock" },
    ]);

    expect(citationLabel("source-b", citationMap)).toBe("[2]");
    expect(citationLabel("unknown", citationMap)).toBe("[?]");
  });
});
