import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/research/provider", () => ({
  researchWithConfiguredProvider: vi.fn().mockResolvedValue({
    provider: "hermes",
    summary: "Background",
    sources: [
      {
        title: "Profile",
        url: "https://example.com/profile",
        accessedAt: "2026-10-01T00:00:00.000Z",
        sourceType: "web",
        origin: "public_research",
        supportsClaims: ["Founded Acme"],
        contactId: "other-users-contact",
        companyId: "other-users-company",
      },
    ],
    claims: [
      {
        text: "Founded Acme",
        category: "background",
        provenance: "public_research",
        sourceUrls: ["https://example.com/profile"],
        contactId: "other-users-contact",
        companyId: "other-users-company",
      },
    ],
    unavailable: [],
    inferred: [],
  }),
}));

describe("research persistence", () => {
  it("links sources and claims to the looked up subject, not to ids returned by the provider", async () => {
    const { researchSubject } = await import("@/lib/domain/research-service");
    const sourceUpsert = vi.fn().mockResolvedValue({ id: "s1", canonicalUrl: "https://example.com/profile" });
    const claimCreate = vi.fn().mockResolvedValue({ id: "cl1" });
    const prisma = {
      contact: { findFirst: vi.fn().mockResolvedValue({ id: "c1", fullName: "Founder", organization: "Acme", companyId: "co1", company: null }) },
      company: { findFirst: vi.fn().mockResolvedValue(null) },
      researchRun: { create: vi.fn().mockResolvedValue({ id: "run-1" }), update: vi.fn(), findUnique: vi.fn().mockResolvedValue({ id: "run-1" }) },
      source: { upsert: sourceUpsert },
      researchClaim: { create: claimCreate },
      claimSource: { create: vi.fn() },
      auditEvent: { create: vi.fn() },
    } as unknown as PrismaClient;

    await researchSubject(prisma, "user-1", { contactId: "c1", query: "Acme founder background" });

    expect(sourceUpsert.mock.calls[0][0].create).toMatchObject({ contactId: "c1", companyId: "co1" });
    expect(claimCreate.mock.calls[0][0].data).toMatchObject({ contactId: "c1", companyId: "co1" });
  });
});
