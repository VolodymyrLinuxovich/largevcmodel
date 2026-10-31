import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const provider = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/lib/research/provider", () => ({ researchWithConfiguredProvider: async () => provider.result }));

import { researchSubject } from "@/lib/domain/research-service";

const accessedAt = "2026-10-01T00:00:00.000Z";

function fakePrisma() {
  const runUpdates: Array<Record<string, unknown>> = [];
  const sources: Array<Record<string, unknown>> = [];
  const links: Array<Record<string, unknown>> = [];
  const prisma = {
    contact: { findFirst: async () => ({ id: "c1", fullName: "Ada", organization: "Acme", companyId: null, company: null }) },
    company: { findFirst: async () => null },
    researchRun: {
      create: async () => ({ id: "run-1" }),
      update: async ({ data }: { data: Record<string, unknown> }) => (runUpdates.push(data), {}),
      findUnique: async () => ({ id: "run-1", status: runUpdates.at(-1)?.status }),
    },
    source: {
      findUnique: async () => null,
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        const saved = { ...create, id: `s${sources.length + 1}` };
        sources.push(saved);
        return saved;
      },
    },
    researchClaim: { create: async () => ({ id: "claim-1" }) },
    claimSource: { create: async ({ data }: { data: Record<string, unknown> }) => (links.push(data), data) },
    auditEvent: { create: async () => ({}) },
  } as unknown as PrismaClient;
  return { prisma, runUpdates, sources, links };
}

describe("research provider returns a malformed URL", () => {
  it("skips the bad source and completes the run", async () => {
    const { prisma, runUpdates, sources, links } = fakePrisma();
    provider.result = {
      provider: "hermes",
      summary: "done",
      sources: [
        { title: "Seed round", url: "https://news.example.com/acme", accessedAt, sourceType: "news", origin: "hermes", supportsClaims: ["Acme raised a seed round."] },
        { title: "Broken", url: "news.example.com/other", accessedAt, sourceType: "news", origin: "hermes", supportsClaims: [] },
      ],
      claims: [
        {
          text: "Acme raised a seed round.",
          category: "funding",
          provenance: "public_research",
          sourceUrls: ["not a url", "https://www.news.example.com/acme/"],
        },
      ],
      unavailable: [],
      inferred: [],
    };

    const run = await researchSubject(prisma, "user-1", { contactId: "c1", query: "Acme funding" });

    expect(run).toMatchObject({ status: "COMPLETED" });
    expect(runUpdates.map((update) => update.status)).toEqual(["COMPLETED"]);
    expect(sources.map((source) => source.url)).toEqual(["https://news.example.com/acme"]);
    expect(links).toEqual([{ claimId: "claim-1", sourceId: "s1", supportedClaim: "Acme raised a seed round." }]);
  });
});
