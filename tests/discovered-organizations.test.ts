import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { persistProviderOrganization } from "@/lib/people/normalization";

type OrgRow = { id: string; userId: string; provider: string; providerOrgId: string | null; name: string; domain: string | null };

function fakePrisma(rows: OrgRow[]) {
  return {
    discoveredOrganization: {
      findUnique: vi.fn(async ({ where }: { where: { userId_provider_providerOrgId: Pick<OrgRow, "userId" | "provider" | "providerOrgId"> } }) => {
        const key = where.userId_provider_providerOrgId;
        return rows.find((row) => row.userId === key.userId && row.provider === key.provider && row.providerOrgId === key.providerOrgId) ?? null;
      }),
      findFirst: vi.fn(async ({ where }: { where: { userId: string; OR: Array<{ domain?: string; name?: { equals: string } }> } }) => {
        return (
          rows.find(
            (row) =>
              row.userId === where.userId &&
              where.OR.some((clause) =>
                clause.domain ? row.domain === clause.domain : row.name.toLowerCase() === clause.name!.equals.toLowerCase(),
              ),
          ) ?? null
        );
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<OrgRow> }) => {
        const row = rows.find((item) => item.id === where.id)!;
        return Object.assign(row, data);
      }),
      create: vi.fn(async ({ data }: { data: Omit<OrgRow, "id"> }) => {
        const row = { ...data, id: `org-${rows.length + 1}` } as OrgRow;
        rows.push(row);
        return row;
      }),
    },
  } as unknown as PrismaClient;
}

describe("persistProviderOrganization", () => {
  it("reuses an organization saved without a provider id when a later result carries one", async () => {
    const rows: OrgRow[] = [];
    const prisma = fakePrisma(rows);

    const first = await persistProviderOrganization(prisma, "user-1", "openai", { name: "Frontier Fund", domain: "frontier.vc" });
    const second = await persistProviderOrganization(prisma, "user-1", "openai", {
      name: "Frontier Fund",
      domain: "frontier.vc",
      providerOrgId: "org_1",
    });

    expect(rows).toHaveLength(1);
    expect(second!.id).toBe(first!.id);
    expect(rows[0]!.providerOrgId).toBe("org_1");
  });

  it("reuses an organization found by another provider", async () => {
    const rows: OrgRow[] = [
      { id: "org-1", userId: "user-1", provider: "hermes", providerOrgId: "h-9", name: "Frontier Fund", domain: "frontier.vc" },
    ];

    const saved = await persistProviderOrganization(fakePrisma(rows), "user-1", "openai", {
      name: "Frontier Fund",
      website: "https://www.frontier.vc",
      providerOrgId: "o-1",
    });

    expect(rows).toHaveLength(1);
    expect(saved!.id).toBe("org-1");
  });

  it("still prefers the provider id match", async () => {
    const rows: OrgRow[] = [
      { id: "org-1", userId: "user-1", provider: "openai", providerOrgId: null, name: "Frontier Fund", domain: "frontier.vc" },
      { id: "org-2", userId: "user-1", provider: "openai", providerOrgId: "org_1", name: "Frontier Fund", domain: "frontier.vc" },
    ];
    const prisma = fakePrisma(rows);

    const saved = await persistProviderOrganization(prisma, "user-1", "openai", {
      name: "Frontier Fund",
      domain: "frontier.vc",
      providerOrgId: "org_1",
    });

    expect(saved!.id).toBe("org-2");
    expect(prisma.discoveredOrganization.findFirst).not.toHaveBeenCalled();
  });
});
