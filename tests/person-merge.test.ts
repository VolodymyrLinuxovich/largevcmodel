import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { persistProviderPerson } from "@/lib/people/normalization";

const existing = {
  id: "person-1",
  provider: "first-provider",
  providerPersonId: "first-1",
  fullName: "Dana Lee",
  currentTitle: "Partner",
  currentOrganizationName: null,
  organizationDomain: null,
  linkedinUrl: "https://linkedin.com/in/dana",
  emailAddresses: ["dana@fund.com"],
  biography: "Partner at Fund",
  industries: ["climate"],
  skills: [],
  normalizedFingerprint: null,
};

function fakePrisma() {
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const prisma = {
    discoveredPerson: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([existing]),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push(args);
        return { ...existing, ...args.data };
      }),
      create: vi.fn(),
    },
    entityResolutionDecision: { create: vi.fn().mockResolvedValue({}) },
    personSource: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    personClaim: { create: vi.fn() },
  };
  return { prisma: prisma as unknown as PrismaClient, updates };
}

describe("persistProviderPerson merge", () => {
  it("keeps stored fields when a matching record arrives without them", async () => {
    const { prisma, updates } = fakePrisma();

    await persistProviderPerson(prisma, "user-1", "second-provider", {
      fullName: "Dana Lee",
      linkedinUrl: "https://linkedin.com/in/dana",
      industries: ["fintech"],
      sources: [],
      claims: [],
    });

    expect(updates).toHaveLength(1);
    const { data } = updates[0]!;
    expect(data.emailAddresses).toEqual(["dana@fund.com"]);
    expect(data).not.toHaveProperty("biography");
    expect(data).not.toHaveProperty("currentTitle");
    expect(data.industries).toEqual(["climate", "fintech"]);
    expect(data).not.toHaveProperty("provider");
    expect(data).not.toHaveProperty("providerPersonId");
    expect(data.searchText).toContain("Partner at Fund");
  });

  it("still applies new values from the incoming record", async () => {
    const { prisma, updates } = fakePrisma();

    await persistProviderPerson(prisma, "user-1", "second-provider", {
      providerPersonId: "second-9",
      fullName: "Dana Lee",
      currentTitle: "Managing Partner",
      linkedinUrl: "https://linkedin.com/in/dana",
      emailAddresses: ["dana@newfund.com"],
      sources: [],
      claims: [],
    });

    const { data } = updates[0]!;
    expect(data.currentTitle).toBe("Managing Partner");
    expect(data.emailAddresses).toEqual(["dana@fund.com", "dana@newfund.com"]);
    expect(data).toMatchObject({ provider: "second-provider", providerPersonId: "second-9" });
  });
});
