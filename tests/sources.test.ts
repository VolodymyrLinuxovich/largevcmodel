import { describe, expect, it } from "vitest";
import { buildCitationMap, canonicalizeUrl, citationLabel, dedupeSources } from "@/lib/domain/sources";

const accessedAt = "2026-07-22T00:00:00.000Z";

describe("source provenance utilities", () => {
  it("canonicalizes and deduplicates equivalent public URLs", () => {
    const sources = dedupeSources([
      {
        title: "Source A",
        url: "https://www.example.com/path/?b=2&a=1#fragment",
        accessedAt,
        sourceType: "news",
        origin: "hermes",
        supportsClaims: ["Claim A"],
      },
      {
        title: "Source B",
        url: "https://example.com/path/?a=1&b=2",
        accessedAt,
        sourceType: "news",
        origin: "hermes",
        supportsClaims: ["Claim B"],
      },
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0].supportsClaims).toEqual(["Claim A", "Claim B"]);
    expect(canonicalizeUrl(sources[0].url)).toBe("https://example.com/path?a=1&b=2");
  });

  it("rejects local or non-url sources", () => {
    expect(() =>
      dedupeSources([
        {
          title: "Invalid",
          url: "/local-source",
          accessedAt,
          sourceType: "company",
          origin: "hermes",
          supportsClaims: ["Claim"],
        },
      ]),
    ).toThrow();
  });

  it("maps citation labels deterministically", () => {
    const citationMap = buildCitationMap([
      { id: "source-a", title: "A", url: "https://example.com/a", sourceType: "company", origin: "hermes" },
      { id: "source-b", title: "B", url: "https://example.com/b", sourceType: "funding", origin: "hermes" },
    ]);

    expect(citationLabel("source-b", citationMap)).toBe("[2]");
    expect(citationLabel("unknown", citationMap)).toBe("[?]");
  });
});
