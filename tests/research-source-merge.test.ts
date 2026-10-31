import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const provider = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/lib/research/provider", () => ({ researchWithConfiguredProvider: async () => provider.result }));

import { researchSubject } from "@/lib/domain/research-service";

type StoredSource = Record<string, unknown> & { id: string; canonicalUrl: string };

function fakePrisma() {
  const sources = new Map<string, StoredSource>();
  const prisma = {
    contact: {
      findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id, fullName: where.id, organization: "Acme", companyId: null, company: null }),
    },
    company: { findFirst: async () => null },
    researchRun: {
      create: async () => ({ id: "run-1" }),
      update: async () => ({}),
      findUnique: async () => ({ id: "run-1" }),
    },
    source: {
      findUnique: async ({ where }: { where: { userId_canonicalUrl: { canonicalUrl: string } } }) =>
        sources.get(where.userId_canonicalUrl.canonicalUrl) ?? null,
      upsert: async ({ where, create, update }: { where: { userId_canonicalUrl: { canonicalUrl: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = where.userId_canonicalUrl.canonicalUrl;
        const existing = sources.get(key);
        const saved = existing ? { ...existing, ...update } : { ...create, id: `s${sources.size + 1}`, canonicalUrl: key };
        sources.set(key, saved as StoredSource);
        return saved;
      },
    },
    researchClaim: { create: async () => ({ id: "claim" }) },
    claimSource: { create: async () => ({}) },
    auditEvent: { create: async () => ({}) },
  } as unknown as PrismaClient;
  return { prisma, sources };
}

function result(claim: string, extra: Record<string, unknown> = {}) {
  return {
    provider: "hermes",
    summary: "",
    sources: [
      {
        title: "Seed round",
        url: "https://news.example.com/acme-seed",
        accessedAt: "2026-10-01T00:00:00.000Z",
        sourceType: "news",
        origin: "hermes",
        supportsClaims: [claim],
        ...extra,
      },
    ],
    claims: [],
    unavailable: [],
    inferred: [],
  };
}

describe("research run on a source that is already stored", () => {
  beforeEach(() => {
    provider.result = null;
  });

  it("keeps the claims and details from earlier runs", async () => {
    const { prisma, sources } = fakePrisma();
    provider.result = result("Ada founded Acme in 2024.", { publisher: "Example News", snippet: "Acme raised a seed round." });
    await researchSubject(prisma, "user-1", { contactId: "ada", query: "Ada background" });

    provider.result = result("Grace joined Acme as CTO.");
    await researchSubject(prisma, "user-1", { contactId: "grace", query: "Grace background" });

    const stored = sources.get("https://news.example.com/acme-seed")!;
    expect(stored.supportsClaims).toEqual(["Ada founded Acme in 2024.", "Grace joined Acme as CTO."]);
    expect(stored.publisher).toBe("Example News");
    expect(stored.snippet).toBe("Acme raised a seed round.");
    expect(stored.contactId).toBe("ada");
  });

  it("does not repeat a claim the source already supports", async () => {
    const { prisma, sources } = fakePrisma();
    provider.result = result("Ada founded Acme in 2024.");
    await researchSubject(prisma, "user-1", { contactId: "ada", query: "Ada background" });
    await researchSubject(prisma, "user-1", { contactId: "ada", query: "Ada background again" });

    expect(sources.get("https://news.example.com/acme-seed")!.supportsClaims).toEqual(["Ada founded Acme in 2024."]);
  });
});
