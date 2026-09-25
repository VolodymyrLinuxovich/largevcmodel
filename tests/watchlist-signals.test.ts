import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { addWatchSchema, markSignalsReadSchema } from "@/lib/watchlist/schemas";
import { addToWatchlist, refreshWatchSignals } from "@/lib/watchlist/service";
import { classifyHealthChange, deriveSignals, type SignalRecords, type WatchTarget } from "@/lib/watchlist/signals";

const SINCE = new Date("2026-09-01T00:00:00.000Z");
const before = new Date("2026-08-30T00:00:00.000Z");
const after = new Date("2026-09-02T00:00:00.000Z");
const later = new Date("2026-09-03T00:00:00.000Z");

function records(overrides: Partial<SignalRecords> = {}): SignalRecords {
  return { claims: [], sources: [], interactions: [], healthSnapshots: [], stageEvents: [], fitScores: [], ...overrides };
}

const companyItem: WatchTarget = { id: "w-company", entityType: "COMPANY", companyId: "co-1", contactId: null, opportunityId: null, since: SINCE };
const contactItem: WatchTarget = { id: "w-contact", entityType: "CONTACT", companyId: null, contactId: "ct-1", opportunityId: null, since: SINCE };
const opportunityItem: WatchTarget = {
  id: "w-opp",
  entityType: "OPPORTUNITY",
  companyId: null,
  contactId: null,
  opportunityId: "opp-1",
  opportunityCompanyId: "co-1",
  since: SINCE,
};

const snapshot = (overrides: Partial<SignalRecords["healthSnapshots"][number]>): SignalRecords["healthSnapshots"][number] => ({
  id: "snap",
  contactId: "ct-1",
  state: "STABLE",
  score: 60,
  previousState: "STABLE",
  previousScore: 60,
  algorithmVersion: "relationship-health-v1",
  calculatedAt: after,
  ...overrides,
});

describe("watchlist signal derivation", () => {
  it("creates signals only for records stored after the item was last checked", () => {
    const signals = deriveSignals(
      [companyItem],
      records({
        claims: [
          { id: "new", companyId: "co-1", contactId: null, text: "Acme opened a Berlin office.", provenance: "PUBLIC_RESEARCH", sourceCount: 1, createdAt: after },
          { id: "old", companyId: "co-1", contactId: null, text: "Old claim", provenance: "PUBLIC_RESEARCH", sourceCount: 1, createdAt: before },
          { id: "other", companyId: "co-2", contactId: null, text: "Other company", provenance: "PUBLIC_RESEARCH", sourceCount: 1, createdAt: after },
        ],
        sources: [{ id: "src", companyId: "co-1", contactId: null, title: "Acme press release", origin: "hermes", publisher: "acme.example", createdAt: after }],
      }),
    );

    expect(signals.map((signal) => [signal.type, signal.sourceRecordId])).toEqual([
      ["NEW_RESEARCH_CLAIM", "new"],
      ["NEW_SOURCE", "src"],
    ]);
    expect(signals[0]).toMatchObject({ provenance: "Research claim (public research, 1 source)", occurredAt: after });
    expect(signals[1]?.provenance).toBe("Source stored from hermes (acme.example)");
  });

  it("uses stable dedupe keys so repeated detection is idempotent", () => {
    const input = records({ interactions: [{ id: "i1", contactId: "ct-1", type: "EMAIL_RECEIVED", occurredAt: before, createdAt: after }] });
    const first = deriveSignals([contactItem], input);
    const second = deriveSignals([contactItem, contactItem], input);

    expect(second.map((signal) => signal.dedupeKey)).toEqual(first.map((signal) => signal.dedupeKey));
    expect(first[0]).toMatchObject({ dedupeKey: "w-contact:NEW_EMAIL:i1", type: "NEW_EMAIL", provenance: "Gmail sync", occurredAt: before });
  });

  it("reports meetings and ignores non-interaction records such as contact imports", () => {
    const signals = deriveSignals(
      [contactItem],
      records({
        interactions: [
          { id: "m1", contactId: "ct-1", type: "CALENDAR_MEETING", occurredAt: later, createdAt: after },
          { id: "imp", contactId: "ct-1", type: "CONTACT_IMPORTED", occurredAt: after, createdAt: after },
        ],
      }),
    );

    expect(signals.map((signal) => [signal.type, signal.provenance])).toEqual([["NEW_MEETING", "Google Calendar sync"]]);
  });

  it("routes stage changes to the watched opportunity or to its company", () => {
    const event = { id: "e1", opportunityId: "opp-1", companyId: "co-1", companyName: "Acme", fromStage: "SCREENING", toStage: "DILIGENCE", actor: "partner@example.com", createdAt: after };
    const unrelated = { ...event, id: "e2", opportunityId: "opp-2", companyId: "co-2" };
    const signals = deriveSignals([opportunityItem, companyItem], records({ stageEvents: [event, unrelated] }));

    expect(signals.map((signal) => signal.dedupeKey).sort()).toEqual(["w-company:OPPORTUNITY_STAGE_CHANGED:e1", "w-opp:OPPORTUNITY_STAGE_CHANGED:e1"]);
    expect(signals[0]).toMatchObject({ title: "Acme moved to diligence", provenance: "Pipeline change by partner@example.com" });
  });

  it("signals fit-score changes only against a previous score and above the threshold", () => {
    const score = (id: string, overall: number, calculatedAt: Date) => ({ id, companyId: "co-1", overall, confidence: 60, modelOrProvider: "LargeVCModel heuristic v1", calculatedAt });
    const signals = deriveSignals(
      [opportunityItem],
      records({ fitScores: [score("f0", 50, before), score("f1", 53, after), score("f2", 61, later)] }),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ type: "FIT_SCORE_CHANGED", sourceRecordId: "f2", title: "Fit score rose from 53 to 61", metadata: { delta: 8 } });
  });

  it("does not signal a first-ever score as a change", () => {
    const signals = deriveSignals([companyItem], records({ fitScores: [{ id: "f1", companyId: "co-1", overall: 70, confidence: 60, modelOrProvider: "x", calculatedAt: after }] }));
    expect(signals).toEqual([]);
  });
});

describe("relationship health signals", () => {
  it("treats the first calculation as a baseline", () => {
    expect(classifyHealthChange(snapshot({ previousState: null, previousScore: null }))).toBeNull();
  });

  it("detects deterioration and improvement from state or large score changes", () => {
    expect(classifyHealthChange(snapshot({ state: "COOLING", score: 45 }))).toBe("DETERIORATED");
    expect(classifyHealthChange(snapshot({ state: "STRENGTHENING", score: 80 }))).toBe("IMPROVED");
    expect(classifyHealthChange(snapshot({ score: 72 }))).toBe("IMPROVED");
    expect(classifyHealthChange(snapshot({ score: 55 }))).toBeNull();
  });

  it("emits a signal with the before and after values", () => {
    const signals = deriveSignals([contactItem], records({ healthSnapshots: [snapshot({ id: "s1", state: "DORMANT", score: 12, previousState: "STABLE", previousScore: 58 })] }));

    expect(signals[0]).toMatchObject({
      type: "RELATIONSHIP_HEALTH_CHANGED",
      title: "Relationship health deteriorated",
      detail: "stable (58) to dormant (12)",
      provenance: "Relationship health engine (relationship-health-v1)",
    });
  });
});

describe("watchlist API input", () => {
  it("rejects unknown entity types and empty read requests", () => {
    expect(addWatchSchema.safeParse({ entityType: "FUND", targetId: "x" }).success).toBe(false);
    expect(addWatchSchema.safeParse({ entityType: "CONTACT", targetId: "" }).success).toBe(false);
    expect(markSignalsReadSchema.safeParse({}).success).toBe(false);
    expect(markSignalsReadSchema.safeParse({ signalIds: [] }).success).toBe(false);
    expect(markSignalsReadSchema.safeParse({ all: true }).success).toBe(true);
  });
});

describe("watchlist service", () => {
  it("refuses to watch a record the user does not own", async () => {
    const prisma = {
      contact: { findFirst: async ({ where }: { where: { userId: string } }) => (where.userId === "owner" ? { id: "ct" } : null) },
    } as unknown as PrismaClient;

    await expect(addToWatchlist(prisma, { id: "intruder", email: "i@example.com" }, { entityType: "CONTACT", targetId: "ct" })).rejects.toMatchObject({
      status: 404,
      code: "WATCH_TARGET_NOT_FOUND",
    });
  });

  it("does nothing when there is nothing to watch", async () => {
    const calls: string[] = [];
    const prisma = {
      watchlistItem: { findMany: async () => (calls.push("items"), []) },
    } as unknown as PrismaClient;

    expect(await refreshWatchSignals(prisma, "user-1")).toEqual({ checked: 0, created: 0 });
    expect(calls).toEqual(["items"]);
  });
});
