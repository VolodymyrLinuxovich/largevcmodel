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

function fakePrisma() {
  const upserts: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const prisma = {
    integration: { update: vi.fn(async () => ({})) },
    contact: {
      findUnique: vi.fn(async () => ({ id: "contact-1", primaryEmail: "ada@example.com" })),
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

const base = {
  resourceName: "people/c1",
  names: [{ displayName: "Ada Lovelace" }],
  emailAddresses: [{ value: "ada@example.com", metadata: { primary: true } }],
};

describe("Google Contacts sync profile fields", () => {
  beforeEach(() => {
    google.connections = [];
  });

  it("keeps stored phone, company, title and photo when Google has none", async () => {
    google.connections = [{ ...base, phoneNumbers: [{ value: "  " }], organizations: [], photos: [] }];
    const { prisma, upserts } = fakePrisma();

    await syncGoogleContacts(prisma, "user-1");

    const update = upserts[0]!.update;
    expect(update.phones).toBeUndefined();
    expect(update.organization).toBeUndefined();
    expect(update.title).toBeUndefined();
    expect(update.profileImageUrl).toBeUndefined();
  });

  it("writes Google values when Google has them", async () => {
    google.connections = [
      {
        ...base,
        phoneNumbers: [{ value: " +1 555 0100 " }],
        organizations: [{ name: "Analytical Engines", title: "Partner", current: true }],
        photos: [{ url: "https://example.com/ada.png", metadata: { primary: true } }],
      },
    ];
    const { prisma, upserts } = fakePrisma();

    await syncGoogleContacts(prisma, "user-1");

    const { create, update } = upserts[0]!;
    for (const fields of [create, update]) {
      expect(fields.phones).toEqual(["+1 555 0100"]);
      expect(fields.organization).toBe("Analytical Engines");
      expect(fields.title).toBe("Partner");
      expect(fields.profileImageUrl).toBe("https://example.com/ada.png");
    }
  });

  it("stores empty values on a new contact when Google has none", async () => {
    google.connections = [base];
    const { prisma, upserts } = fakePrisma();

    await syncGoogleContacts(prisma, "user-1");

    const create = upserts[0]!.create;
    expect(create.phones).toEqual([]);
    expect(create.organization).toBeNull();
    expect(create.profileImageUrl).toBeNull();
  });
});
