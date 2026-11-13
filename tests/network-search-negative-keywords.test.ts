import { describe, expect, it } from "vitest";
import { parseNetworkObjective, rankNetworkCandidates, type NetworkCandidate } from "@/lib/domain/network-search";

const now = new Date("2026-07-23T00:00:00.000Z");

function person(id: string, text: string): NetworkCandidate {
  return {
    id,
    entityType: "PERSON",
    title: "Contact",
    subtitle: null,
    href: null,
    text,
    sourceTypes: ["Google Contacts"],
    occurredAt: new Date("2026-04-01T00:00:00.000Z"),
    relationshipStrength: 4,
    interactionCount: 1,
    hasUserReply: true,
    classification: "PERSON",
    classificationConfidence: 86,
    classificationSignals: ["Fixture evidence"],
    evidence: [],
  };
}

const negatives = (result: { contradictedCriteria: Array<{ criterion: string }> } | undefined) =>
  result?.contradictedCriteria.filter((item) => item.criterion === "Negative keyword") ?? [];

describe("network search excluded words", () => {
  it("drops stopwords from the excluded list", () => {
    const parsed = parseNetworkObjective({ query: "Find founders not in crypto", strictness: "balanced" }, now);
    expect(parsed.negativeKeywords).toEqual(["crypto"]);
  });

  it("does not flag a word that only appears inside another word", () => {
    const parsed = parseNetworkObjective({ query: "Find robotics contacts excluding ai", strictness: "balanced" }, now);
    const [result] = rankNetworkCandidates(parsed, [person("person:email", "robotics engineer, email me about maintenance")]);
    expect(negatives(result)).toHaveLength(0);
  });

  it("still flags the excluded word on its own", () => {
    const parsed = parseNetworkObjective({ query: "Find robotics contacts excluding ai", strictness: "balanced" }, now);
    const [result] = rankNetworkCandidates(parsed, [person("person:ai", "robotics and AI engineer")]);
    expect(negatives(result)).toHaveLength(1);
  });

  it("does not flag every candidate when the query says not in", () => {
    const parsed = parseNetworkObjective({ query: "Find founders not in crypto", strictness: "balanced" }, now);
    const [result] = rankNetworkCandidates(parsed, [person("person:berlin", "founder building robots in Berlin")]);
    expect(negatives(result)).toHaveLength(0);
  });
});
