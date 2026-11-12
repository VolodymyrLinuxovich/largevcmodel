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

type StoredContact = { id: string; source: string; primaryEmail: string | null; providerId: string | null; emails: string[]; notes: string | null };

/** A small in-memory contact table with the same unique keys as the schema. */
function fakePrisma(contacts: StoredContact[]) {
  let nextId = contacts.length + 1;
  const prisma = {
    integration: { update: vi.fn(async () => ({})) },
    contact: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, { primaryEmail?: string; source?: string; providerId?: string }> }) => {
        if (where.userId_primaryEmail) return contacts.find((c) => c.primaryEmail === where.userId_primaryEmail!.primaryEmail) ?? null;
        const key = where.userId_source_providerId!;
        return contacts.find((c) => c.source === key.source && c.providerId === key.providerId) ?? null;
      }),
      findFirst: vi.fn(async ({ where }: { where: { providerId: string } }) => contacts.find((c) => c.providerId === where.providerId) ?? null),
      upsert: vi.fn(
        async (args: {
          where: { id?: string; userId_source_providerId?: { source: string; providerId: string } };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = args.where.userId_source_providerId;
          const found = args.where.id
            ? contacts.find((c) => c.id === args.where.id)
            : contacts.find((c) => c.source === key!.source && c.providerId === key!.providerId);
          if (found) {
            Object.assign(found, Object.fromEntries(Object.entries(args.update).filter(([, value]) => value !== undefined)));
            return { ...found, fullName: null };
          }
          const created = { ...(args.create as unknown as StoredContact), id: `contact-${nextId++}` };
          contacts.push(created);
          return { ...created, fullName: null };
        },
      ),
    },
    contactInteraction: { upsert: vi.fn(async () => ({})) },
    relationshipEdge: { upsert: vi.fn(async () => ({})) },
  };
  return prisma as unknown as PrismaClient;
}

const person = (emails: string[]) => ({
  resourceName: "people/c1",
  names: [{ displayName: "Ada Lovelace" }],
  emailAddresses: emails.map((value, index) => ({ value, metadata: { primary: index === 0 } })),
});

describe("Google Contacts sync provider match", () => {
  beforeEach(() => {
    google.connections = [];
  });

  it("keeps one contact when Google changes the primary email of a contact first seen in Gmail", async () => {
    const contacts: StoredContact[] = [
      { id: "contact-1", source: "GMAIL", primaryEmail: "ada@old.example", providerId: "ada@old.example", emails: ["ada@old.example"], notes: null },
    ];
    const prisma = fakePrisma(contacts);

    google.connections = [person(["ada@old.example"])];
    await syncGoogleContacts(prisma, "user-1");
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.providerId).toBe("people/c1");

    google.connections = [person(["ada@new.example", "ada@old.example"])];
    await syncGoogleContacts(prisma, "user-1");

    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.emails).toEqual(["ada@new.example", "ada@old.example"]);
  });

  it("still creates a contact for a person it has never seen", async () => {
    const contacts: StoredContact[] = [];
    google.connections = [person(["ada@example.com"])];

    await syncGoogleContacts(fakePrisma(contacts), "user-1");

    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.source).toBe("GOOGLE_CONTACTS");
  });
});
