import { describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/errors";
import { summarizeOpportunityRelationships, type LinkedContactHealth } from "@/lib/pipeline/relationship-summary";
import { createOpportunitySchema, stageChangeSchema, updateOpportunitySchema } from "@/lib/pipeline/schemas";
import { changeOpportunityStage, createOpportunity, updateOpportunity } from "@/lib/pipeline/service";
import { allowedNextStages, openCompanyKey, validateStageTransition } from "@/lib/pipeline/stages";
import { planStageChange } from "@/lib/pipeline/transitions";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const actor = { id: "user-1", email: "partner@example.com", name: "Partner" };

describe("opportunity stage transitions", () => {
  it("allows forward moves, including skipping intermediate stages", () => {
    expect(validateStageTransition({ from: "SOURCED", to: "SCREENING" })).toMatchObject({ ok: true, direction: "forward" });
    expect(validateStageTransition({ from: "SOURCED", to: "MEETING" })).toMatchObject({ ok: true, direction: "forward" });
  });

  it("rejects no-op transitions", () => {
    expect(validateStageTransition({ from: "MEETING", to: "MEETING" })).toMatchObject({ ok: false, code: "SAME_STAGE" });
  });

  it("only allows INVESTED from IC", () => {
    expect(validateStageTransition({ from: "DILIGENCE", to: "INVESTED" })).toMatchObject({ ok: false, code: "IC_REQUIRED_BEFORE_INVESTMENT" });
    expect(validateStageTransition({ from: "IC", to: "INVESTED" })).toMatchObject({ ok: true, direction: "invest" });
  });

  it("requires a meaningful pass reason", () => {
    expect(validateStageTransition({ from: "SCREENING", to: "PASSED" })).toMatchObject({ ok: false, code: "PASS_REASON_REQUIRED" });
    expect(validateStageTransition({ from: "SCREENING", to: "PASSED", passReason: "  " })).toMatchObject({ ok: false });
    expect(validateStageTransition({ from: "SCREENING", to: "PASSED", passReason: "Outside thesis" })).toMatchObject({ ok: true });
  });

  it("requires a note to move backwards", () => {
    expect(validateStageTransition({ from: "DILIGENCE", to: "MEETING" })).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
    expect(validateStageTransition({ from: "DILIGENCE", to: "MEETING", note: "Need a second partner meeting" })).toMatchObject({
      ok: true,
      direction: "backward",
    });
  });

  it("treats INVESTED as terminal and restricts how passed deals reopen", () => {
    expect(allowedNextStages("INVESTED")).toEqual([]);
    expect(allowedNextStages("PASSED")).toEqual(["SOURCED", "SCREENING"]);
    expect(validateStageTransition({ from: "PASSED", to: "DILIGENCE", note: "Reopened" })).toMatchObject({ ok: false, code: "INVALID_REOPEN_STAGE" });
    expect(validateStageTransition({ from: "PASSED", to: "SCREENING" })).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
  });

  it("offers every active stage except the current one plus PASSED from an early stage", () => {
    expect(allowedNextStages("SCREENING")).toEqual(["SOURCED", "MEETING", "DILIGENCE", "IC", "PASSED"]);
  });
});

describe("stage change planning", () => {
  const subject = { id: "o1", userId: "user-1", companyId: "co-1", stage: "SCREENING" as const, passReason: null };

  it("closes the opportunity and releases the open-company key when passing", () => {
    const plan = planStageChange(subject, { toStage: "PASSED", passReason: " Too early for fund " }, NOW);

    expect(plan).toMatchObject({
      ok: true,
      data: { stage: "PASSED", closedAt: NOW, openCompanyKey: null, passReason: "Too early for fund", stageChangedAt: NOW },
      event: { fromStage: "SCREENING", toStage: "PASSED", note: "Too early for fund" },
    });
  });

  it("clears the pass reason and restores the open-company key when reopening", () => {
    const plan = planStageChange({ ...subject, stage: "PASSED", passReason: "Too early" }, { toStage: "SCREENING", note: "Raised a bridge" }, NOW);

    expect(plan).toMatchObject({
      ok: true,
      data: { stage: "SCREENING", closedAt: null, passReason: null, openCompanyKey: "user-1:co-1" },
    });
  });

  it("returns the validation error without producing a patch", () => {
    expect(planStageChange(subject, { toStage: "INVESTED" }, NOW)).toMatchObject({ ok: false, error: { code: "IC_REQUIRED_BEFORE_INVESTMENT" } });
  });

  it("derives a per-user open-company key only for open stages", () => {
    expect(openCompanyKey("u", "c", "IC")).toBe("u:c");
    expect(openCompanyKey("u", "c", "INVESTED")).toBeNull();
  });
});

describe("opportunity relationship summary", () => {
  const person = (overrides: Partial<LinkedContactHealth>): LinkedContactHealth => ({
    contactId: "c",
    name: "Person",
    role: "FOUNDER",
    healthScore: null,
    healthState: null,
    healthCalculatedAt: null,
    ...overrides,
  });

  it("distinguishes no contacts, uncalculated and insufficient evidence", () => {
    expect(summarizeOpportunityRelationships([]).status).toBe("NO_CONTACTS");
    expect(summarizeOpportunityRelationships([person({})]).status).toBe("NOT_CALCULATED");
    expect(summarizeOpportunityRelationships([person({ healthState: "INSUFFICIENT_DATA" })]).status).toBe("INSUFFICIENT_DATA");
  });

  it("uses the strongest assessed relationship and ignores insufficient ones", () => {
    const summary = summarizeOpportunityRelationships([
      person({ contactId: "a", name: "Founder", healthScore: 41, healthState: "COOLING" }),
      person({ contactId: "b", name: "Introducer", role: "INTRODUCER", healthScore: 77, healthState: "STABLE" }),
      person({ contactId: "c", healthState: "INSUFFICIENT_DATA" }),
    ]);

    expect(summary).toMatchObject({ status: "ASSESSED", score: 77, state: "STABLE", strongest: { contactId: "b" } });
  });
});

describe("opportunity input validation", () => {
  it("requires exactly one of companyId or a new company", () => {
    expect(createOpportunitySchema.safeParse({}).success).toBe(false);
    expect(createOpportunitySchema.safeParse({ companyId: "co", company: { name: "Acme" } }).success).toBe(false);
    expect(createOpportunitySchema.safeParse({ company: { name: "Acme" } }).success).toBe(true);
  });

  it("rejects non-http company URLs and unknown fields", () => {
    expect(createOpportunitySchema.safeParse({ company: { name: "Acme", website: "javascript:alert(1)" } }).success).toBe(false);
    expect(createOpportunitySchema.safeParse({ company: { name: "Acme" }, stage: "IC" }).success).toBe(false);
  });

  it("stores blank optional text as null and parses date-only values as UTC days", () => {
    const parsed = createOpportunitySchema.parse({ company: { name: "Acme", sector: "" }, notes: "   ", nextActionAt: "2026-10-01" });

    expect(parsed.company?.sector).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(parsed.nextActionAt).toEqual(new Date("2026-10-01T00:00:00.000Z"));
  });

  it("requires a version and at least one field for updates, and a known stage for stage changes", () => {
    expect(updateOpportunitySchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(updateOpportunitySchema.safeParse({ priority: "HIGH" }).success).toBe(false);
    expect(updateOpportunitySchema.safeParse({ priority: "HIGH", expectedVersion: 1 }).success).toBe(true);
    expect(stageChangeSchema.safeParse({ toStage: "CLOSED_WON", expectedVersion: 1 }).success).toBe(false);
  });
});

describe("opportunity service authorization and concurrency", () => {
  it("returns 404 for another user's opportunity because every lookup is scoped by userId", async () => {
    const fake = fakePipelinePrisma({ opportunity: { id: "o1", userId: "someone-else", companyId: "co", stage: "SOURCED", passReason: null, version: 1 } });

    await expect(changeOpportunityStage(fake.prisma, actor, "o1", { toStage: "SCREENING", expectedVersion: 1 }, NOW)).rejects.toMatchObject({
      status: 404,
    });
    expect(fake.updates).toHaveLength(0);
  });

  it("rejects stale versions with a 409 and writes nothing", async () => {
    const fake = fakePipelinePrisma({ opportunity: { id: "o1", userId: "user-1", companyId: "co", stage: "SOURCED", passReason: null, version: 3 } });

    await expect(changeOpportunityStage(fake.prisma, actor, "o1", { toStage: "SCREENING", expectedVersion: 2 }, NOW)).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
    });
    expect(fake.updates).toHaveLength(0);
    expect(fake.events).toHaveLength(0);
  });

  it("rejects invalid transitions with a 422 before writing", async () => {
    const fake = fakePipelinePrisma({ opportunity: { id: "o1", userId: "user-1", companyId: "co", stage: "SOURCED", passReason: null, version: 1 } });

    await expect(changeOpportunityStage(fake.prisma, actor, "o1", { toStage: "PASSED", expectedVersion: 1 }, NOW)).rejects.toMatchObject({
      status: 422,
      code: "PASS_REASON_REQUIRED",
    });
    expect(fake.updates).toHaveLength(0);
  });

  it("persists a valid stage change with a version guard and a history event", async () => {
    const fake = fakePipelinePrisma({ opportunity: { id: "o1", userId: "user-1", companyId: "co", stage: "SOURCED", passReason: null, version: 1 } });

    await changeOpportunityStage(fake.prisma, actor, "o1", { toStage: "MEETING", note: null, expectedVersion: 1 }, NOW);

    expect(fake.updates[0]).toMatchObject({
      where: { id: "o1", userId: "user-1", version: 1 },
      data: { stage: "MEETING", stageChangedAt: NOW, openCompanyKey: "user-1:co", version: { increment: 1 } },
    });
    expect(fake.events[0]).toMatchObject({ type: "STAGE_CHANGED", fromStage: "SOURCED", toStage: "MEETING", actor: actor.email, userId: "user-1" });
    expect(fake.audits[0]).toMatchObject({ action: "Opportunity stage changed", userId: "user-1" });
  });

  it("refuses to link contacts the user does not own when creating an opportunity", async () => {
    const fake = fakePipelinePrisma({ ownedContactIds: ["mine"] });

    await expect(
      createOpportunity(fake.prisma, actor, createOpportunitySchema.parse({ company: { name: "Acme" }, contacts: [{ contactId: "not-mine" }] })),
    ).rejects.toMatchObject({ status: 404, code: "CONTACT_NOT_FOUND" });
    expect(fake.created).toHaveLength(0);
  });

  it("maps the open-company unique constraint to a 409 conflict", async () => {
    const fake = fakePipelinePrisma({ failCreateWithUnique: true });

    const error = await createOpportunity(fake.prisma, actor, createOpportunitySchema.parse({ company: { name: "Acme" } })).catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "OPEN_OPPORTUNITY_EXISTS", details: { opportunityId: "existing" } });
  });

  it("only fills empty fields when a known company is re-entered", async () => {
    const fake = fakePipelinePrisma({ existingCompany: { id: "co", name: "Acme", sector: "Robotics", geography: null } });

    await createOpportunity(fake.prisma, actor, createOpportunitySchema.parse({ company: { name: "Acme", sector: "Drones", geography: "Kyiv" } }));
    expect(fake.companyUpdates).toEqual([{ where: { id: "co" }, data: { geography: "Kyiv" } }]);
    expect(fake.created[0]).toMatchObject({ companyId: "co" });
  });

  it("only writes supplied fields on update", async () => {
    const fake = fakePipelinePrisma({ opportunity: { id: "o1", userId: "user-1", companyId: "co", stage: "SOURCED", passReason: null, version: 4 } });

    await updateOpportunity(fake.prisma, actor, "o1", updateOpportunitySchema.parse({ priority: "HIGH", expectedVersion: 4 }));
    expect(fake.updates[0]).toEqual({
      where: { id: "o1", userId: "user-1", version: 4 },
      data: { priority: "HIGH", version: { increment: 1 } },
    });
  });
});

type FakeOpportunity = { id: string; userId: string; companyId: string; stage: "SOURCED"; passReason: null; version: number };

type FakeCompany = { id: string; name: string; sector: string | null; geography: string | null };

function fakePipelinePrisma(options: {
  opportunity?: FakeOpportunity;
  ownedContactIds?: string[];
  failCreateWithUnique?: boolean;
  existingCompany?: FakeCompany;
}) {
  const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const events: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];
  const companyUpdates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const matches = (where: Record<string, unknown>) =>
    options.opportunity &&
    (where.id === undefined || where.id === options.opportunity.id) &&
    where.userId === options.opportunity.userId &&
    (where.version === undefined || where.version === options.opportunity.version);

  const client: Record<string, unknown> = {
    opportunity: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.openCompanyKey) return { id: "existing" };
        return matches(where) ? { ...options.opportunity } : null;
      },
      findFirstOrThrow: async () => ({ ...options.opportunity, company: { name: "Acme" } }),
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matches(args.where)) return { count: 0 };
        updates.push(args);
        return { count: 1 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failCreateWithUnique) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
            meta: { target: ["openCompanyKey"] },
          });
        }
        created.push(data);
        return { id: "new-opportunity", ...data };
      },
    },
    opportunityEvent: { create: async ({ data }: { data: Record<string, unknown> }) => (events.push(data), data) },
    opportunityContact: { createMany: async () => ({ count: 0 }) },
    company: {
      findUnique: async () =>
        options.existingCompany
          ? { domain: null, website: null, description: null, stage: null, businessModel: null, ...options.existingCompany }
          : null,
      create: async ({ data }: { data: { name: string } }) => ({ id: "co", name: data.name }),
      update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => (companyUpdates.push(args), args.data),
      findFirst: async () => null,
    },
    contact: {
      findMany: async ({ where }: { where: { userId: string; id: { in: string[] } } }) =>
        where.id.in.filter((id) => where.userId === "user-1" && (options.ownedContactIds ?? []).includes(id)).map((id) => ({ id })),
    },
    investmentThesis: { findFirst: async () => null },
    auditEvent: { create: async ({ data }: { data: Record<string, unknown> }) => (audits.push(data), data) },
  };
  client.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => callback(client);

  return { prisma: client as unknown as PrismaClient, updates, events, audits, created, companyUpdates };
}
