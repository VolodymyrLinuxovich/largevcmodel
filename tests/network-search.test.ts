import { describe, expect, it } from "vitest";
import {
  classifyRecord,
  dedupeNetworkCandidates,
  networkSearchRequestSchema,
  parseNetworkObjective,
  rankNetworkCandidates,
  type NetworkCandidate,
} from "@/lib/domain/network-search";
import { deriveWorkspaceConnectionState } from "@/lib/workspace-state";

const now = new Date("2026-07-23T00:00:00.000Z");

function candidate(input: Partial<NetworkCandidate> & Pick<NetworkCandidate, "id" | "entityType" | "title" | "text">): NetworkCandidate {
  return {
    subtitle: null,
    href: null,
    sourceTypes: ["Google Contacts"],
    occurredAt: new Date("2026-04-01T00:00:00.000Z"),
    relationshipStrength: 4,
    interactionCount: 1,
    hasUserReply: true,
    classification: input.entityType,
    classificationConfidence: 86,
    classificationSignals: ["Fixture evidence"],
    evidence: [],
    ...input,
  };
}

function search(query: string, candidates: NetworkCandidate[], extra: Partial<Parameters<typeof parseNetworkObjective>[0]> = {}) {
  const parsed = parseNetworkObjective({ query, strictness: "balanced", ...extra }, now);
  return rankNetworkCandidates(parsed, candidates);
}

describe("general network search", () => {
  it("supports person searches with role, topic, geography, and funding-stage criteria", () => {
    const results = search("Find defense AI founders in Ukraine who raised seed funding", [
      candidate({
        id: "person:1",
        entityType: "PERSON",
        title: "A founder in Ukraine",
        subtitle: "Founder / defense AI",
        text: "co-founder building defense AI in Ukraine. Saved sourced claim says seed funding.",
      }),
    ]);

    expect(results[0]).toMatchObject({ entityType: "PERSON" });
    expect(results[0].unavailableCriteria).toHaveLength(0);
    expect(results[0].whyMatched).toContain("role");
  });

  it("supports role-based investor searches without making stage mandatory", () => {
    const parsed = parseNetworkObjective({ query: "Find investors I spoke with last year", strictness: "balanced" }, now);
    const results = rankNetworkCandidates(parsed, [
      candidate({
        id: "person:investor",
        entityType: "PERSON",
        title: "Investor contact",
        subtitle: "Partner / venture firm",
        text: "venture partner investor conversation",
        occurredAt: new Date("2025-09-01T00:00:00.000Z"),
      }),
    ]);

    expect(parsed.roles).toContain("investor");
    expect(parsed.fundingStages).toHaveLength(0);
    expect(results).toHaveLength(1);
  });

  it("supports company and organization searches", () => {
    const results = search("Find everyone associated with Anduril", [
      candidate({
        id: "company:anduril",
        entityType: "COMPANY",
        title: "Anduril",
        text: "Anduril defense technology organization with connected contacts",
      }),
      candidate({
        id: "person:employee",
        entityType: "PERSON",
        title: "Connected operator",
        subtitle: "Operator / Anduril",
        text: "operator associated with Anduril",
      }),
    ]);

    expect(results.map((result) => result.entityType)).toEqual(expect.arrayContaining(["PERSON", "COMPANY"]));
  });

  it("supports conversation searches by topic", () => {
    const results = search("Find conversations about robotics", [
      candidate({
        id: "thread:robotics",
        entityType: "CONVERSATION",
        title: "Robotics partnership",
        text: "Gmail thread discussing robotics platform integration",
        sourceTypes: ["Gmail"],
        classification: "CONVERSATION",
      }),
    ]);

    expect(results[0]).toMatchObject({ entityType: "CONVERSATION" });
  });

  it("supports meeting searches", () => {
    const results = search("Find meetings about robotics in Europe", [
      candidate({
        id: "meeting:robotics",
        entityType: "MEETING",
        title: "Robotics Europe sync",
        text: "calendar event with robotics team in Europe",
        sourceTypes: ["Google Calendar"],
        classification: "MEETING",
      }),
    ]);

    expect(results[0]).toMatchObject({ entityType: "MEETING" });
  });

  it("handles geographic searches without swapped sector/geography filters", () => {
    const parsed = parseNetworkObjective({ query: "Find people in Europe working on robotics", sector: "Ukraine", strictness: "balanced" }, now);
    expect(parsed.geographies).toEqual(expect.arrayContaining(["Ukraine", "europe"]));
    expect(parsed.topics).not.toContain("Ukraine");
  });

  it("supports recency and no-follow-up conditions", () => {
    const results = search("Find founders I met but never followed up with", [
      candidate({
        id: "person:no-follow-up",
        entityType: "PERSON",
        title: "Founder met at event",
        text: "founder calendar meeting",
        hasUserReply: false,
        interactionCount: 2,
      }),
    ]);

    expect(results[0].evidence.some((item) => item.criterion === "Follow-up state")).toBe(true);
  });

  it("supports relationship-path searches", () => {
    const results = search("Find people who could introduce me to someone at Anduril", [
      candidate({
        id: "person:path",
        entityType: "PERSON",
        title: "Warm path contact",
        text: "connected to Anduril",
        metadata: { relationshipPathCount: 2 },
      }),
    ]);

    expect(results[0].evidence.some((item) => item.criterion === "Introduction path")).toBe(true);
  });

  it("suppresses automated senders for irrelevant person queries", () => {
    const pizzaExpress = candidate({
      id: "person:pizzaexpress",
      entityType: "PERSON",
      title: "PizzaExpress Promotions",
      text: "restaurant expansion marketing email",
      sourceTypes: ["Gmail"],
      classification: "AUTOMATED_SENDER",
      classificationConfidence: 97,
      classificationSignals: ["List-Unsubscribe header", "No reciprocal conversation", "Bulk sender pattern"],
      interactionCount: 7,
    });

    const results = search("Find defense AI founders in Ukraine", [pizzaExpress]);
    expect(results).toHaveLength(0);
  });

  it("allows automated senders when the query asks for that content", () => {
    const newsletter = candidate({
      id: "thread:newsletter",
      entityType: "CONVERSATION",
      title: "Restaurant expansion newsletter",
      text: "newsletter about restaurant expansion and new locations",
      sourceTypes: ["Gmail"],
      classification: "MAILING_LIST",
      classificationConfidence: 97,
      classificationSignals: ["List-Unsubscribe header", "No reciprocal conversation"],
      interactionCount: 1,
    });

    const results = search("Find newsletters about restaurant expansion", [newsletter]);
    expect(results[0]).toMatchObject({ entityType: "CONVERSATION", classification: "MAILING_LIST" });
  });

  it("keeps partial matches and marks missing public research criteria unavailable", () => {
    const results = search("Find seed-funded founders", [
      candidate({
        id: "person:partial",
        entityType: "PERSON",
        title: "Founder without public funding evidence",
        text: "founder building AI systems",
      }),
    ]);

    expect(results[0].unavailableCriteria.some((item) => item.criterion === "Funding stage")).toBe(true);
  });

  it("penalizes contradictory evidence", () => {
    const parsed = parseNetworkObjective({ query: "Find robotics contacts excluding recruiting", strictness: "balanced" }, now);
    const results = rankNetworkCandidates(parsed, [
      candidate({
        id: "person:contradicted",
        entityType: "PERSON",
        title: "Recruiting contact",
        text: "robotics recruiting recruiter",
      }),
    ]);

    expect(results[0]?.contradictedCriteria.some((item) => item.criterion === "Negative keyword")).toBe(true);
  });

  it("prefers empty results over unrelated output", () => {
    const results = search("Find Berkeley professors working on climate modeling", [
      candidate({
        id: "thread:receipt",
        entityType: "CONVERSATION",
        title: "Receipt",
        text: "restaurant receipt",
        classification: "MAILING_LIST",
        sourceTypes: ["Gmail"],
      }),
    ]);

    expect(results).toHaveLength(0);
  });

  it("rejects malformed filters", () => {
    const parsed = networkSearchRequestSchema.safeParse({ query: "Find people", strictness: "precise" });
    expect(parsed.success).toBe(false);
  });

  it("classifies automated senders using headers and behavior, not only address strings", () => {
    const classified = classifyRecord({
      entityType: "CONVERSATION",
      title: "Weekly update",
      email: "team@example.com",
      messageDirections: ["received"],
      headers: [{ "List-Unsubscribe": "<mailto:unsubscribe@example.com>", Precedence: "bulk" }],
    });

    expect(classified.classification).toBe("MAILING_LIST");
    expect(classified.signals).toEqual(expect.arrayContaining(["List-Unsubscribe header", "Bulk precedence header"]));
  });

  it("deduplicates candidates by stable ids before ranking", () => {
    const parsed = parseNetworkObjective({ query: "Find robotics people", strictness: "balanced" }, now);
    const duplicate = candidate({ id: "person:same", entityType: "PERSON", title: "Robotics person", text: "robotics engineer person", metadata: { primaryEmail: "person@example.com" } });
    const duplicateFromCalendar = candidate({ id: "meeting-attendee:same", entityType: "PERSON", title: "Robotics person", text: "robotics engineer person", metadata: { primaryEmail: "person@example.com" } });
    const results = rankNetworkCandidates(parsed, dedupeNetworkCandidates([duplicate, duplicateFromCalendar]));
    expect(results).toHaveLength(1);
  });

  it("derives authenticated workspace state from integrations, not local records", () => {
    const state = deriveWorkspaceConnectionState({
      user: { id: "user" },
      googleOAuthConfigured: true,
      databaseConfigured: true,
      integrations: [{ status: "CONNECTED", syncStatus: "idle", lastSyncedAt: new Date() }],
      syncJobs: [],
    });

    expect(state).toBe("connected_ready");
  });
});
