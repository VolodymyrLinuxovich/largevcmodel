import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  calculateRelationshipHealth,
  type HealthInteraction,
  type HealthInteractionType,
  type RelationshipHealthInput,
} from "@/lib/domain/relationship-health";
import { healthChanged, refreshRelationshipHealth } from "@/lib/domain/relationship-health-service";
import { advanceLastInteraction } from "@/lib/domain/relationships";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const DAY = 86_400_000;
const connected = { gmailConnected: true, calendarConnected: true };

function daysAgo(days: number, from = NOW) {
  return new Date(from.getTime() - days * DAY);
}

function at(type: HealthInteractionType, days: number): HealthInteraction {
  return { type, occurredAt: daysAgo(days) };
}

function health(interactions: HealthInteraction[], overrides: Partial<RelationshipHealthInput> = {}) {
  return calculateRelationshipHealth({ now: NOW, interactions, coverage: connected, ...overrides });
}

/** An active, reciprocal relationship: emails both ways every ~10 days plus two recent meetings. */
function activeHistory() {
  return [
    at("EMAIL_SENT", 3),
    at("EMAIL_RECEIVED", 2),
    at("EMAIL_SENT", 13),
    at("EMAIL_RECEIVED", 12),
    at("CALENDAR_MEETING", 20),
    at("EMAIL_SENT", 33),
    at("EMAIL_RECEIVED", 32),
    at("CALENDAR_MEETING", 60),
    at("EMAIL_SENT", 100),
    at("EMAIL_RECEIVED", 110),
  ];
}

describe("relationship health: insufficient evidence", () => {
  it("returns INSUFFICIENT_DATA with a null score when no interactions exist", () => {
    const result = health([]);

    expect(result.state).toBe("INSUFFICIENT_DATA");
    expect(result.score).toBeNull();
    expect(result.components).toEqual([]);
    expect(result.followUp.recommendedAt).toBeNull();
    expect(result.explanation.join(" ")).toContain("not treated as evidence of a weak relationship");
  });

  it("does not treat an imported contact record as an interaction", () => {
    const result = health([at("CONTACT_IMPORTED", 1)]);

    expect(result.state).toBe("INSUFFICIENT_DATA");
    expect(result.lastInteractionAt).toBeNull();
    expect(result.evidence.map((item) => item.kind)).toEqual(["CONTACT_IMPORTED"]);
  });

  it("requires more than a single email, but accepts a single meeting", () => {
    expect(health([at("EMAIL_RECEIVED", 5)]).state).toBe("INSUFFICIENT_DATA");
    expect(health([at("CALENDAR_MEETING", 5)]).state).not.toBe("INSUFFICIENT_DATA");
  });

  it("explains missing integrations instead of penalizing the contact", () => {
    const result = health([], { coverage: { gmailConnected: false, calendarConnected: false } });

    expect(result.state).toBe("INSUFFICIENT_DATA");
    expect(result.explanation).toContain("Gmail is not connected, so email history may be incomplete.");
    expect(result.explanation).toContain("Google Calendar is not connected, so meeting history may be incomplete.");
  });
});

describe("relationship health: scoring and decay", () => {
  it("scores an active reciprocal relationship highly and explains every component", () => {
    const result = health(activeHistory());

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.components.map((component) => component.key)).toEqual(["recency", "frequency", "reciprocity", "meetings", "depth"]);
    expect(result.components.every((component) => component.available && component.score !== null)).toBe(true);
    expect(result.lastInteractionType).toBe("EMAIL_RECEIVED");
    expect(result.daysSinceLastInteraction).toBe(2);
  });

  it("decays monotonically as time passes without new interactions", () => {
    const interactions = activeHistory();
    const evaluate = (laterDays: number) =>
      calculateRelationshipHealth({ now: new Date(NOW.getTime() + laterDays * DAY), interactions, coverage: connected });

    const scores = [0, 30, 60, 120, 240].map((days) => evaluate(days).score!);
    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index]).toBeLessThan(scores[index - 1]!);
    }
    expect(evaluate(0).state).not.toBe("COOLING");
    expect(evaluate(70).state).toBe("COOLING");
    expect(evaluate(240).state).toBe("DORMANT");
  });

  it("distinguishes a genuinely stale relationship from missing data", () => {
    const stale = health([at("EMAIL_SENT", 400), at("EMAIL_RECEIVED", 395), at("CALENDAR_MEETING", 390)]);
    const unknown = health([]);

    expect(stale.state).toBe("DORMANT");
    expect(stale.score).not.toBeNull();
    expect(stale.score!).toBeLessThan(30);
    expect(stale.followUp.recommendedAt).toEqual(NOW);
    expect(unknown.state).toBe("INSUFFICIENT_DATA");
    expect(unknown.score).toBeNull();
  });

  it("detects strengthening and cooling trends from window counts", () => {
    const strengthening = health([at("EMAIL_SENT", 5), at("EMAIL_RECEIVED", 10), at("EMAIL_SENT", 20), at("EMAIL_RECEIVED", 30), at("EMAIL_SENT", 120)]);
    const cooling = health([at("EMAIL_SENT", 50), at("EMAIL_SENT", 100), at("EMAIL_RECEIVED", 110), at("EMAIL_SENT", 130), at("EMAIL_RECEIVED", 150)]);

    expect(strengthening.state).toBe("STRENGTHENING");
    expect(strengthening.trend).toMatchObject({ recentCount: 4, priorCount: 1, direction: "UP" });
    expect(cooling.state).toBe("COOLING");
    expect(cooling.trend.direction).toBe("DOWN");
  });

  it("scores one-directional outreach below a reciprocal exchange", () => {
    const oneWay = health([at("EMAIL_SENT", 3), at("EMAIL_SENT", 10), at("EMAIL_SENT", 20), at("EMAIL_SENT", 30)]);
    const reciprocal = health([at("EMAIL_SENT", 3), at("EMAIL_RECEIVED", 10), at("EMAIL_SENT", 20), at("EMAIL_RECEIVED", 30)]);

    const reciprocity = (result: typeof oneWay) => result.components.find((component) => component.key === "reciprocity")!;
    expect(reciprocity(oneWay).score).toBe(10);
    expect(reciprocity(reciprocal).score).toBe(100);
    expect(oneWay.score!).toBeLessThan(reciprocal.score!);
  });

  it("excludes unavailable signals and renormalizes weights instead of scoring them as zero", () => {
    const withoutCalendar = health([at("EMAIL_SENT", 3), at("EMAIL_RECEIVED", 4)], {
      coverage: { gmailConnected: true, calendarConnected: false },
    });
    const meetings = withoutCalendar.components.find((component) => component.key === "meetings")!;

    expect(meetings).toMatchObject({ available: false, score: null });
    expect(withoutCalendar.score!).toBeGreaterThan(0);
    expect(withoutCalendar.score!).toBeLessThanOrEqual(100);
  });

  it("treats future calendar events as upcoming meetings, not past interactions", () => {
    const result = health([at("EMAIL_SENT", 30), at("EMAIL_RECEIVED", 29), { type: "CALENDAR_MEETING", occurredAt: new Date(NOW.getTime() + 3 * DAY) }]);

    expect(result.lastInteractionAt).toEqual(daysAgo(29));
    expect(result.upcomingMeetingAt).toEqual(new Date(NOW.getTime() + 3 * DAY));
    expect(result.followUp.recommendedAt).toBeNull();
    expect(result.followUp.reason).toContain("already scheduled");
  });

  it("uses lifetime aggregates that extend beyond the lookback window for historical depth", () => {
    const recent = [at("EMAIL_SENT", 3), at("EMAIL_RECEIVED", 4)];
    const shallow = health(recent);
    const deep = health(recent, { lifetime: { directCount: 40, firstAt: daysAgo(1500) } });

    const depth = (result: typeof shallow) => result.components.find((component) => component.key === "depth")!.score!;
    expect(depth(deep)).toBeGreaterThan(depth(shallow));
    expect(deep.firstInteractionAt).toEqual(daysAgo(1500));
  });

  it("is deterministic for identical inputs", () => {
    expect(health(activeHistory())).toEqual(health(activeHistory()));
  });
});

describe("relationship health: follow-up recommendations", () => {
  it("schedules the next follow-up from the observed cadence", () => {
    const result = health([at("EMAIL_SENT", 5), at("EMAIL_RECEIVED", 25), at("EMAIL_SENT", 45)]);

    expect(result.followUp.recommendedAt).toEqual(new Date(daysAgo(5).getTime() + 20 * DAY));
    expect(result.followUp.overdueDays).toBe(0);
  });

  it("marks the follow-up as overdue when the cadence has elapsed", () => {
    const result = health([at("EMAIL_SENT", 40), at("EMAIL_RECEIVED", 55), at("EMAIL_SENT", 70)]);

    expect(result.followUp.recommendedAt).toEqual(NOW);
    expect(result.followUp.overdueDays).toBe(25);
  });
});

describe("relationship health persistence", () => {
  it("detects changes in state, score, and follow-up date", () => {
    const current = health(activeHistory());
    const persisted = {
      id: "c1",
      healthScore: current.score,
      healthState: current.state,
      nextFollowUpAt: current.followUp.recommendedAt,
    };

    expect(healthChanged(persisted, current)).toBe(false);
    expect(healthChanged({ ...persisted, healthScore: (current.score ?? 0) - 1 }, current)).toBe(true);
    expect(healthChanged({ ...persisted, healthState: "COOLING" }, current)).toBe(true);
    expect(healthChanged({ ...persisted, nextFollowUpAt: null }, current)).toBe(true);
  });

  it("scopes every query to the user, batches loads, and snapshots only changed contacts", async () => {
    const fake = fakeHealthPrisma();
    const result = await refreshRelationshipHealth(fake.prisma, "user-1", { contactIds: ["c-active", "c-unchanged"], now: NOW });

    expect(result.calculated).toBe(2);
    expect(result.changed).toBe(1);
    expect(fake.calls.interactionFindMany).toBe(1);
    expect(fake.whereClauses.every((where) => where.userId === "user-1")).toBe(true);
    expect(fake.snapshots).toHaveLength(1);
    expect(fake.snapshots[0]).toMatchObject({ contactId: "c-active", previousState: null, userId: "user-1" });
    expect(fake.contactUpdates.map((update) => update.where)).toEqual([
      { id: "c-active", userId: "user-1" },
      { id: "c-unchanged", userId: "user-1" },
    ]);
  });
});

describe("advanceLastInteraction", () => {
  it("only moves the last interaction forward and ignores future events", async () => {
    const calls: Array<{ where: unknown; data: unknown }> = [];
    const prisma = {
      contact: { updateMany: async (args: { where: unknown; data: unknown }) => (calls.push(args), { count: 1 }) },
    } as unknown as PrismaClient;

    await advanceLastInteraction(prisma, "user-1", "c1", daysAgo(3), NOW);
    await advanceLastInteraction(prisma, "user-1", "c1", new Date(NOW.getTime() + DAY), NOW);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      where: { id: "c1", userId: "user-1", OR: [{ lastInteractionAt: null }, { lastInteractionAt: { lt: daysAgo(3) } }] },
      data: { lastInteractionAt: daysAgo(3) },
    });
  });
});

function fakeHealthPrisma() {
  const whereClauses: Array<Record<string, unknown>> = [];
  const calls = { interactionFindMany: 0 };
  const snapshots: Array<Record<string, unknown>> = [];
  const contactUpdates: Array<{ where: unknown; data: unknown }> = [];
  const insufficient = calculateRelationshipHealth({ now: NOW, interactions: [], coverage: connected });
  const record = <T>(where: Record<string, unknown>, value: T) => {
    whereClauses.push(where);
    return Promise.resolve(value);
  };

  const prisma = {
    integration: {
      findMany: ({ where }: { where: Record<string, unknown> }) =>
        record(where, [{ service: "GMAIL" }, { service: "GOOGLE_CALENDAR" }]),
    },
    contact: {
      findMany: ({ where }: { where: Record<string, unknown> }) =>
        record(where, [
          { id: "c-active", healthScore: null, healthState: null, nextFollowUpAt: null },
          { id: "c-unchanged", healthScore: insufficient.score, healthState: insufficient.state, nextFollowUpAt: null },
        ]),
      updateMany: (args: { where: Record<string, unknown>; data: unknown }) => {
        contactUpdates.push(args);
        return record(args.where, { count: 1 });
      },
    },
    contactInteraction: {
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        calls.interactionFindMany += 1;
        return record(
          where,
          activeHistory().map((item) => ({ contactId: "c-active", ...item })),
        );
      },
      groupBy: ({ where }: { where: Record<string, unknown> }) => record(where, []),
    },
    relationshipEdge: { findMany: ({ where }: { where: Record<string, unknown> }) => record(where, []) },
    relationshipHealthSnapshot: {
      createMany: ({ data }: { data: Array<Record<string, unknown>> }) => {
        snapshots.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
    $transaction: (operations: Array<Promise<unknown>>) => Promise.all(operations),
  } as unknown as PrismaClient;

  return { prisma, whereClauses, calls, snapshots, contactUpdates };
}
