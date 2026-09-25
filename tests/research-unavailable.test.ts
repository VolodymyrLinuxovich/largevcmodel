import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { claimProvenance, researchSubject } from "@/lib/domain/research-service";
import { assembleMeetingBrief } from "@/lib/briefs/assemble";
import { getConfiguredResearchProvider } from "@/lib/research/provider";
import { emptyBundle } from "./fixtures/evidence-bundle";

const originalProvider = process.env.RESEARCH_PROVIDER;

afterEach(() => {
  if (originalProvider === undefined) delete process.env.RESEARCH_PROVIDER;
  else process.env.RESEARCH_PROVIDER = originalProvider;
});

describe("provider provenance at ingest", () => {
  it("stores provider claims labelled user-provided or connected-account as unverified", () => {
    expect(claimProvenance("user_provided")).toBe("UNVERIFIED");
    expect(claimProvenance("connected_account")).toBe("UNVERIFIED");
    expect(claimProvenance("public_research")).toBe("PUBLIC_RESEARCH");
    expect(claimProvenance("ai_inference")).toBe("AI_INFERENCE");
  });
});

describe("unavailable research provider", () => {
  it("records an unavailable run and writes no claims or sources", async () => {
    process.env.RESEARCH_PROVIDER = "none";
    const writes: string[] = [];
    const runUpdates: Array<Record<string, unknown>> = [];
    const audits: Array<Record<string, unknown>> = [];
    const prisma = {
      contact: { findFirst: async () => ({ id: "c1", fullName: "Founder", organization: "Acme", companyId: null, company: null }) },
      company: { findFirst: async () => null },
      researchRun: {
        create: async () => ({ id: "run-1" }),
        update: async ({ data }: { data: Record<string, unknown> }) => (runUpdates.push(data), { id: "run-1", ...data }),
        findUnique: async () => ({ id: "run-1", status: runUpdates.at(-1)?.status, claims: [] }),
      },
      source: { upsert: async () => (writes.push("source"), {}) },
      researchClaim: { create: async () => (writes.push("claim"), {}) },
      claimSource: { create: async () => (writes.push("claimSource"), {}) },
      auditEvent: { create: async ({ data }: { data: Record<string, unknown> }) => (audits.push(data), data) },
    } as unknown as PrismaClient;

    expect(getConfiguredResearchProvider()).toBeNull();
    const run = await researchSubject(prisma, "user-1", { contactId: "c1", query: "Acme founder background" });

    expect(run).toMatchObject({ status: "UNAVAILABLE" });
    expect(runUpdates[0]).toMatchObject({ status: "UNAVAILABLE" });
    expect(String(runUpdates[0]?.error)).toContain("No research provider is configured");
    expect(writes).toEqual([]);
    expect(audits[0]).toMatchObject({ action: "Research failed", outcome: "unavailable" });
  });

  it("produces a brief that reports missing research instead of inventing it", () => {
    const brief = assembleMeetingBrief(emptyBundle());

    expect(brief.facts.research).toEqual([]);
    expect(brief.missingInformation).toContain("No research claims are stored for this company or its linked people.");
  });
});
