import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadBundleMeetings } from "@/lib/evidence/loader";

const DAY = 86_400_000;
const now = new Date("2026-10-01T12:00:00Z");

type Row = { id: string; startsAt: Date };
type Args = { where: { startsAt: { lte?: Date; gt?: Date } }; orderBy: { startsAt: "asc" | "desc" }; take: number };

function prismaWith(rows: Row[]) {
  return {
    calendarEvent: {
      findMany: async ({ where, orderBy, take }: Args) =>
        rows
          .filter((row) => (where.startsAt.lte ? row.startsAt <= where.startsAt.lte : true) && (where.startsAt.gt ? row.startsAt > where.startsAt.gt : true))
          .sort((a, b) => (orderBy.startsAt === "asc" ? +a.startsAt - +b.startsAt : +b.startsAt - +a.startsAt))
          .slice(0, take),
    },
  } as unknown as PrismaClient;
}

describe("evidence meetings", () => {
  it("keeps past meetings and the next meetings when a daily series fills the future", async () => {
    const future = Array.from({ length: 90 }, (_, index) => ({ id: `daily-${index + 1}`, startsAt: new Date(now.getTime() + (index + 1) * DAY) }));
    const past = [
      { id: "past-1", startsAt: new Date(now.getTime() - 2 * DAY) },
      { id: "past-2", startsAt: new Date(now.getTime() - 10 * DAY) },
    ];

    const meetings = await loadBundleMeetings(prismaWith([...future, ...past]), "user-1", [{ contactId: { in: ["ct-1"] } }], now);
    const ids = meetings.map((meeting) => meeting.id);

    expect(ids).toContain("past-1");
    expect(ids).toContain("past-2");
    expect(ids).toContain("daily-1");
    expect(ids).not.toContain("daily-90");
  });

  it("skips the query when there is nobody to match", async () => {
    expect(await loadBundleMeetings(prismaWith([]), "user-1", [], now)).toEqual([]);
  });
});
