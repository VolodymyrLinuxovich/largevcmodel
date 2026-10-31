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

type StoredContact = { id: string; primaryEmail: string | null; providerId: string | null; notes: string | null; fullName: string | null };

function fakePrisma(contacts: StoredContact[]) {
  const upserts: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const prisma = {
    integration: { update: vi.fn(async () => ({})) },
    contact: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, { primaryEmail?: string; providerId?: string }> }) => {
        if (where.userId_primaryEmail) return contacts.find((contact) => contact.primaryEmail === where.userId_primaryEmail!.primaryEmail) ?? null;
        if (where.userId_source_providerId) return contacts.find((contact) => contact.providerId === where.userId_source_providerId!.providerId) ?? null;
        return null;
      }),
      upsert: vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        upserts.push(args);
        return { id: "contact-1", fullName: "Ada Lovelace", primaryEmail: "ada@example.com" };
      }),
    },
    contactInteraction: { upsert: vi.fn(async () => ({})) },
    relationshipEdge: { upsert: vi.fn(async () => ({})) },
  };
  return { prisma: prisma as unknown as PrismaClient, upserts };
}

const person = (biography?: string) => ({
  resourceName: "people/c1",
  names: [{ displayName: "Ada Lovelace" }],
  emailAddresses: [{ value: "ada@example.com", metadata: { primary: true } }],
  biographies: biography ? [{ value: biography }] : [],
});

describe("Google Contacts sync", () => {
  beforeEach(() => {
    google.connections = [];
  });

  it("keeps notes the user already wrote for a contact matched by email", async () => {
    google.connections = [person("Met at a conference")];
    const { prisma, upserts } = fakePrisma([{ id: "contact-1", primaryEmail: "ada@example.com", providerId: null, notes: "Prefers intros through Bob", fullName: "Ada" }]);

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.update.notes).toBeUndefined();
  });

  it("keeps notes when Google has no biography for a contact matched by provider id", async () => {
    google.connections = [person()];
    const { prisma, upserts } = fakePrisma([{ id: "contact-1", primaryEmail: null, providerId: "people/c1", notes: "Follow up in March", fullName: "Ada" }]);

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.update.notes).toBeUndefined();
  });

  it("fills empty notes from the Google biography", async () => {
    google.connections = [person("Met at a conference")];
    const { prisma, upserts } = fakePrisma([{ id: "contact-1", primaryEmail: "ada@example.com", providerId: null, notes: null, fullName: "Ada" }]);

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.update.notes).toBe("Met at a conference");
    expect(upserts[0]?.create.notes).toBe("Met at a conference");
  });
});
