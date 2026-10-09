import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const googleFetch = vi.fn();
const refreshHealth = vi.fn();

vi.mock("@/lib/google/api", () => ({
  googleFetch: (...args: unknown[]) => googleFetch(...args),
  getConnectedIntegration: async () => ({ id: "int-1", accountEmail: "me@vc.example", lastSyncedAt: null }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/domain/relationships", () => ({ advanceLastInteraction: vi.fn(), recalculateRelationshipStrength: vi.fn() }));
vi.mock("@/lib/domain/relationship-health-sync", () => ({
  refreshRelationshipHealthAfterSync: (...args: unknown[]) => refreshHealth(...args),
}));

const { syncGoogleCalendar } = await import("@/lib/google/calendar");

function prismaMock() {
  return {
    integration: { update: vi.fn() },
    contact: { findFirst: vi.fn(async () => null), update: vi.fn() },
    calendarEvent: {
      findUnique: vi.fn(async () => ({ id: "evt-row", contactId: "ct-old" })),
      upsert: vi.fn(),
    },
    contactInteraction: { upsert: vi.fn(), deleteMany: vi.fn() },
    relationshipEdge: { upsert: vi.fn() },
  };
}

describe("calendar sync when a contact leaves an event", () => {
  beforeEach(() => {
    googleFetch.mockReset();
    refreshHealth.mockReset();
    googleFetch.mockResolvedValue({
      items: [
        {
          id: "g-1",
          summary: "Weekly sync",
          attendees: [{ email: "someone@else.example" }],
          start: { dateTime: "2026-09-20T10:00:00Z" },
          end: { dateTime: "2026-09-20T10:30:00Z" },
        },
      ],
    });
  });

  it("clears the event contact and removes the stale meeting interaction", async () => {
    const prisma = prismaMock();

    await syncGoogleCalendar(prisma as unknown as PrismaClient, "user-1");

    expect(prisma.calendarEvent.upsert.mock.calls[0][0].update.contactId).toBeNull();
    expect(prisma.contactInteraction.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", type: "CALENDAR_MEETING", providerId: "g-1" },
    });
    expect(refreshHealth.mock.calls[0][2]).toEqual(["ct-old"]);
  });

  it("does not delete anything for a new event without a matching contact", async () => {
    const prisma = prismaMock();
    prisma.calendarEvent.findUnique.mockResolvedValue(null as never);

    await syncGoogleCalendar(prisma as unknown as PrismaClient, "user-1");

    expect(prisma.contactInteraction.deleteMany).not.toHaveBeenCalled();
  });
});
