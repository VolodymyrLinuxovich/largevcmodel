import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/google/api", () => ({
  getConnectedIntegration: vi.fn(async () => ({ id: "integration-1", accountEmail: "me@example.com", lastSyncedAt: null })),
  googleFetch: vi.fn(async (_prisma: unknown, _userId: unknown, _service: unknown, url: string) =>
    url.includes("/messages/")
      ? {
          id: "m1",
          threadId: "t1",
          internalDate: "1760000000000",
          payload: {
            headers: [
              { name: "From", value: '"Lovelace, Ada" <ada@example.com>' },
              { name: "To", value: "Me <me@example.com>" },
              { name: "Subject", value: "Hello" },
            ],
          },
        }
      : { messages: [{ id: "m1", threadId: "t1" }] },
  ),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/domain/relationships", () => ({
  advanceLastInteraction: vi.fn(async () => undefined),
  recalculateRelationshipStrength: vi.fn(async () => undefined),
}));

import { syncGmail } from "@/lib/google/gmail";

function fakePrisma(storedName: string | null) {
  const calls: Record<string, unknown[]> = {};
  const model = (name: string, overrides: Record<string, (args: never) => unknown> = {}) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) =>
          vi.fn(async (args: never) => {
            (calls[`${name}.${method}`] ??= []).push(args);
            if (overrides[method]) return overrides[method](args);
            return method.startsWith("find") ? (method === "findMany" ? [] : null) : { id: `${name}-1` };
          }),
      },
    );
  const prisma = {
    integration: model("integration"),
    gmailMessage: model("gmailMessage"),
    gmailThread: model("gmailThread"),
    contactInteraction: model("contactInteraction"),
    relationshipEdge: model("relationshipEdge"),
    contact: model("contact", {
      upsert: () => ({ id: "contact-1", fullName: storedName ?? "ada@example.com", primaryEmail: "ada@example.com", interactionCount: 1 }),
      update: (args: { data: { fullName: string } }) => ({ id: "contact-1", fullName: args.data.fullName, interactionCount: 1 }),
    }),
  };
  return { prisma: prisma as unknown as PrismaClient, calls };
}

describe("Gmail sync contact names", () => {
  it("creates new contacts with the header name", async () => {
    const { prisma, calls } = fakePrisma(null);
    await syncGmail(prisma, "user-1");
    const upsert = calls["contact.upsert"]?.[0] as { create: { fullName: string } };
    expect(upsert.create.fullName).toBe("Lovelace, Ada");
  });

  it("renames a contact still named after its address", async () => {
    const { prisma, calls } = fakePrisma("ada@example.com");
    await syncGmail(prisma, "user-1");
    expect(calls["contact.update"]?.[0]).toEqual({ where: { id: "contact-1" }, data: { fullName: "Lovelace, Ada" } });
  });

  it("keeps a real stored name", async () => {
    const { prisma, calls } = fakePrisma("Ada King");
    await syncGmail(prisma, "user-1");
    expect(calls["contact.update"]).toBeUndefined();
  });
});
