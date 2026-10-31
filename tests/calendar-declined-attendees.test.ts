import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const google = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@/lib/google/api", () => ({
  getConnectedIntegration: async () => ({ id: "int-1", accountEmail: "me@fund.com", lastSyncedAt: null }),
  googleFetch: async () => google.payload,
}));
vi.mock("@/lib/domain/relationships", () => ({ advanceLastInteraction: async () => undefined, recalculateRelationshipStrength: async () => null }));
vi.mock("@/lib/domain/relationship-health-sync", () => ({ refreshRelationshipHealthAfterSync: async () => null }));

import { meetingContactEmails, syncGoogleCalendar } from "@/lib/google/calendar";

describe("meetingContactEmails", () => {
  it("leaves out attendees who declined", () => {
    expect(
      meetingContactEmails([
        { email: "Ada@Acme.com", responseStatus: "declined" },
        { email: "grace@acme.com", responseStatus: "accepted" },
        { email: "linus@acme.com", responseStatus: "needsAction" },
        { email: "alan@acme.com" },
        {},
      ]),
    ).toEqual(["grace@acme.com", "linus@acme.com", "alan@acme.com"]);
  });
});

describe("calendar sync", () => {
  it("does not credit a meeting to a contact who declined it", async () => {
    google.payload = {
      items: [
        {
          id: "evt-1",
          summary: "Intro call",
          start: { dateTime: "2026-10-01T15:00:00.000Z" },
          end: { dateTime: "2026-10-01T15:30:00.000Z" },
          attendees: [
            { email: "me@fund.com", responseStatus: "accepted" },
            { email: "ada@acme.com", responseStatus: "declined" },
          ],
        },
      ],
    };
    const lookups: unknown[] = [];
    const interactions: unknown[] = [];
    const events: Array<Record<string, unknown>> = [];
    const prisma = {
      integration: { update: async () => ({}) },
      contact: {
        findFirst: async ({ where }: { where: { primaryEmail: { in: string[] } } }) => {
          lookups.push(where.primaryEmail.in);
          return where.primaryEmail.in.includes("ada@acme.com") ? { id: "ada", fullName: "Ada", primaryEmail: "ada@acme.com" } : null;
        },
        update: async () => ({}),
      },
      calendarEvent: {
        findUnique: async () => null,
        upsert: async ({ create }: { create: Record<string, unknown> }) => (events.push(create), create),
      },
      contactInteraction: { upsert: async (args: unknown) => (interactions.push(args), {}) },
      relationshipEdge: { upsert: async () => ({}) },
      auditEvent: { create: async () => ({}) },
    } as unknown as PrismaClient;

    await syncGoogleCalendar(prisma, "user-1");

    expect(lookups).toEqual([["me@fund.com"]]);
    expect(interactions).toEqual([]);
    expect(events[0]).toMatchObject({ contactId: undefined, attendees: ["me@fund.com", "ada@acme.com"] });
  });
});
