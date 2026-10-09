import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { recalculateRelationshipStrength } from "@/lib/domain/relationships";

const DAY = 86_400_000;
const now = new Date("2026-10-01T12:00:00Z");

function prismaWith(meetings: Date[]) {
  const interactions = meetings.map((occurredAt) => ({ type: "CALENDAR_MEETING", occurredAt }));
  return {
    contact: {
      findFirst: vi.fn(async () => ({ lastInteractionAt: null })),
      update: vi.fn(),
    },
    contactInteraction: {
      groupBy: vi.fn(async ({ where }: { where: { occurredAt?: { lte: Date } } }) => {
        const rows = interactions.filter((item) => !where.occurredAt || item.occurredAt <= where.occurredAt.lte);
        return rows.length ? [{ type: "CALENDAR_MEETING", _count: { id: rows.length } }] : [];
      }),
    },
    calendarEvent: {
      count: vi.fn(async ({ where }: { where: { startsAt: { gt?: Date; gte?: Date } } }) => {
        const after = where.startsAt.gt ?? where.startsAt.gte!;
        return meetings.filter((date) => date > after).length;
      }),
    },
  } as unknown as PrismaClient;
}

describe("relationship strength", () => {
  it("counts a future meeting only as upcoming", async () => {
    const result = await recalculateRelationshipStrength(prismaWith([new Date(now.getTime() + 7 * DAY)]), "user-1", "ct-1", now);

    expect(result?.evidence.calendarMeetings).toBe(0);
    expect(result?.evidence.upcomingMeetings).toBe(1);
    expect(result?.overall).toBe(10);
  });

  it("counts past meetings as meetings", async () => {
    const result = await recalculateRelationshipStrength(prismaWith([new Date(now.getTime() - 3 * DAY)]), "user-1", "ct-1", now);

    expect(result?.evidence.calendarMeetings).toBe(1);
    expect(result?.evidence.upcomingMeetings).toBe(0);
  });
});
