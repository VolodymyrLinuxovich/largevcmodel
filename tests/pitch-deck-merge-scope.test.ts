import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireCurrentUser: vi.fn() }));
const db = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));

vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/prisma", () => db);

const user = { id: "user-1", email: "partner@example.com", name: "Partner", imageUrl: null, role: "partner" };

const extraction = {
  id: "ex-1",
  userId: "user-1",
  startupId: "startup-b",
  pitchDeckId: "deck-b",
  fields: [{ id: "field-1", fieldKey: "industry", extractedValue: "Defense" }],
  startup: { id: "startup-b", name: "Startup B" },
  pitchDeck: { id: "deck-b" },
};

let startupUpdates: Array<{ where: { id: string } }>;

beforeEach(() => {
  auth.requireCurrentUser.mockReset();
  auth.requireCurrentUser.mockResolvedValue(user);
  startupUpdates = [];
  for (const key of Object.keys(db.prisma)) delete db.prisma[key];
  Object.assign(db.prisma, {
    pitchDeckExtraction: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, string> }) =>
        Object.entries(where).every(([key, value]) => extraction[key as keyof typeof extraction] === value) ? extraction : null,
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    pitchDeckExtractionField: { update: vi.fn().mockResolvedValue({}) },
    startupProfile: {
      update: vi.fn(async (args: { where: { id: string } }) => {
        startupUpdates.push(args);
        return { id: args.where.id, name: "Startup B" };
      }),
    },
    pitchDeck: { update: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  });
});

function mergeRequest(startupId: string) {
  return import("@/app/api/startups/[startupId]/pitch-deck/merge/route").then(({ POST }) =>
    POST(
      new Request("http://localhost/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ extractionId: "ex-1", fields: [{ fieldId: "field-1", action: "accept" }] }),
      }),
      { params: Promise.resolve({ startupId }) },
    ),
  );
}

describe("pitch deck merge route", () => {
  it("writes nothing when the extraction belongs to another startup", async () => {
    const response = await mergeRequest("startup-a");

    expect(response.status).toBe(404);
    expect(startupUpdates).toEqual([]);
    expect((db.prisma.pitchDeckExtractionField as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
    expect((db.prisma.pitchDeck as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
  });

  it("merges accepted fields into the startup that owns the extraction", async () => {
    const response = await mergeRequest("startup-b");

    expect(response.status).toBe(200);
    expect(startupUpdates).toHaveLength(1);
    expect(startupUpdates[0]).toMatchObject({ where: { id: "startup-b" }, data: { industry: "Defense" } });
  });
});
