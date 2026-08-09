import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  createGoogleCalendarEvent: vi.fn(),
  requireCurrentUser: vi.fn().mockResolvedValue({ id: "user", email: "user@example.com" }),
  prisma: {
    calendarEvent: { create: vi.fn() },
    contact: { findFirst: vi.fn() },
    outreachDraft: { findFirst: vi.fn(), updateMany: vi.fn() },
    reply: { create: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/google/calendar", () => ({ createGoogleCalendarEvent: mocks.createGoogleCalendarEvent }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { POST as bookCalendarEvent } from "@/app/api/calendar/book/route";
import { POST as ingestReply } from "@/app/api/replies/ingest/route";

describe("API ownership checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a reply that references an unowned contact", async () => {
    mocks.prisma.contact.findFirst.mockResolvedValue(null);
    const response = await ingestReply(
      jsonRequest("http://localhost/api/replies/ingest", {
        contactId: "another-users-contact",
        bodySnippet: "Happy to meet next week.",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { id: "another-users-contact", userId: "user" },
      select: { id: true },
    });
    expect(mocks.prisma.reply.create).not.toHaveBeenCalled();
  });

  it("rejects an unowned contact before creating a Google Calendar event", async () => {
    mocks.prisma.contact.findFirst.mockResolvedValue(null);
    const response = await bookCalendarEvent(
      jsonRequest("http://localhost/api/calendar/book", {
        contactId: "another-users-contact",
        summary: "Investor call",
        attendees: ["investor@example.com"],
        startsAt: "2026-08-10T17:00:00.000Z",
        endsAt: "2026-08-10T18:00:00.000Z",
        confirmCreate: true,
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createGoogleCalendarEvent).not.toHaveBeenCalled();
    expect(mocks.prisma.calendarEvent.create).not.toHaveBeenCalled();
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
