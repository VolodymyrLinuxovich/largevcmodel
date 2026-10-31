import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const google = vi.hoisted(() => ({ connections: [] as unknown[] }));

vi.mock("@/lib/google/api", () => ({
  getConnectedIntegration: vi.fn(async () => ({ id: "integration-1", accountEmail: "me@example.com", lastSyncedAt: null })),
  googleFetch: vi.fn(async () => ({ connections: google.connections })),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/domain/relationships", () => ({ recalculateRelationshipStrength: vi.fn(async () => undefined) }));

import { syncGoogleContacts } from "@/lib/google/contacts";

function fakePrisma(stored: { id: string; primaryEmail: string; fullName: string } | null) {
  const upserts: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const prisma = {
    integration: { update: vi.fn(async () => ({})) },
    contact: {
      findUnique: vi.fn(async () => stored),
      upsert: vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        upserts.push(args);
        return { id: "contact-1", fullName: stored?.fullName ?? null, primaryEmail: "ada@example.com" };
      }),
    },
    contactInteraction: { upsert: vi.fn(async () => ({})) },
    relationshipEdge: { upsert: vi.fn(async () => ({})) },
  };
  return { prisma: prisma as unknown as PrismaClient, upserts };
}

const person = (names: Array<{ displayName?: string }>) => ({
  resourceName: "people/c1",
  names,
  emailAddresses: [{ value: "ada@example.com", metadata: { primary: true } }],
});

describe("Google Contacts sync names", () => {
  beforeEach(() => {
    google.connections = [];
  });

  it("keeps the stored name when Google has no name for the contact", async () => {
    google.connections = [person([])];
    const { prisma, upserts } = fakePrisma({ id: "contact-1", primaryEmail: "ada@example.com", fullName: "Ada Lovelace" });

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.update.fullName).toBeUndefined();
  });

  it("treats a blank Google name as missing", async () => {
    google.connections = [person([{ displayName: "   " }])];
    const { prisma, upserts } = fakePrisma({ id: "contact-1", primaryEmail: "ada@example.com", fullName: "Ada Lovelace" });

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.update.fullName).toBeUndefined();
    expect(upserts[0]?.create.fullName).toBe("ada@example.com");
  });

  it("updates the name when Google has one", async () => {
    google.connections = [person([{ displayName: "Augusta Ada King" }])];
    const { prisma, upserts } = fakePrisma({ id: "contact-1", primaryEmail: "ada@example.com", fullName: "Ada Lovelace" });

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.update.fullName).toBe("Augusta Ada King");
    expect(upserts[0]?.create.fullName).toBe("Augusta Ada King");
  });

  it("names a new nameless contact after its email", async () => {
    google.connections = [person([])];
    const { prisma, upserts } = fakePrisma(null);

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.create.fullName).toBe("ada@example.com");
  });
});
