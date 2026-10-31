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

type StoredContact = { id: string; primaryEmail: string | null; providerId: string | null; emails: string[] };

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

const person = (emails: string[]) => ({
  resourceName: "people/c1",
  names: [{ displayName: "Ada Lovelace" }],
  emailAddresses: emails.map((value, index) => ({ value, metadata: { primary: index === 0 } })),
});

describe("Google Contacts sync emails", () => {
  beforeEach(() => {
    google.connections = [];
  });

  it("keeps stored emails for a contact matched by email", async () => {
    google.connections = [person(["ada@example.com"])];
    const { prisma, upserts } = fakePrisma([{ id: "contact-1", primaryEmail: "ada@example.com", providerId: null, emails: ["ada@example.com", "ada@work.example"] }]);

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.update.emails).toEqual(["ada@example.com", "ada@work.example"]);
  });

  it("keeps stored emails when Google has none for a contact matched by provider id", async () => {
    google.connections = [person([])];
    const { prisma, upserts } = fakePrisma([{ id: "contact-1", primaryEmail: "ada@example.com", providerId: "people/c1", emails: ["ada@example.com"] }]);

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.update.emails).toEqual(["ada@example.com"]);
  });

  it("adds new Google emails to the stored list", async () => {
    google.connections = [person(["ada@example.com", "ada@new.example"])];
    const { prisma, upserts } = fakePrisma([{ id: "contact-1", primaryEmail: "ada@example.com", providerId: null, emails: ["ada@old.example"] }]);

    await syncGoogleContacts(prisma, "user-1");

    expect(upserts[0]?.update.emails).toEqual(["ada@example.com", "ada@new.example", "ada@old.example"]);
    expect(upserts[0]?.create.emails).toEqual(["ada@example.com", "ada@new.example"]);
  });
});
