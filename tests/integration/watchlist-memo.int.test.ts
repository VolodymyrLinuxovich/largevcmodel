import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finalizeInvestmentMemo, generateInvestmentMemo } from "@/lib/memos/service";
import { createOpportunitySchema } from "@/lib/pipeline/schemas";
import { changeOpportunityStage, createOpportunity } from "@/lib/pipeline/service";
import { addToWatchlist, listSignals, refreshWatchSignals } from "@/lib/watchlist/service";
import { createUser, deleteUsers, prisma } from "./db";

let alice: Awaited<ReturnType<typeof createUser>>;
let bob: Awaited<ReturnType<typeof createUser>>;
const soon = (ms = 1_000) => new Date(Date.now() + ms);

beforeAll(async () => {
  alice = await createUser("alice-watch");
  bob = await createUser("bob-watch");
});

afterAll(async () => {
  await deleteUsers([alice.id, bob.id]);
  await prisma.$disconnect();
});

describe("watchlist signals against PostgreSQL", () => {
  it("derives signals from newly stored records, deduplicates reruns and isolates users", async () => {
    const contact = await prisma.contact.create({ data: { userId: alice.id, source: "MANUAL", fullName: "Watched Founder" } });
    const opportunity = await createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Watched Co" } }));
    await addToWatchlist(prisma, alice, { entityType: "CONTACT", targetId: contact.id });
    await addToWatchlist(prisma, alice, { entityType: "OPPORTUNITY", targetId: opportunity.id });
    expect((await addToWatchlist(prisma, alice, { entityType: "CONTACT", targetId: contact.id })).created).toBe(false);

    await prisma.contactInteraction.create({
      data: { userId: alice.id, contactId: contact.id, type: "EMAIL_RECEIVED", providerId: "msg-1", occurredAt: new Date(), createdAt: soon() },
    });
    await prisma.researchClaim.create({
      data: { userId: alice.id, companyId: opportunity.companyId, text: "Watched Co shipped v2.", category: "product", provenance: "USER_PROVIDED", createdAt: soon() },
    });
    await changeOpportunityStage(prisma, alice, opportunity.id, { toStage: "SCREENING", expectedVersion: 1 });
    await prisma.opportunityEvent.updateMany({ where: { opportunityId: opportunity.id, type: "STAGE_CHANGED" }, data: { createdAt: soon() } });

    const first = await refreshWatchSignals(prisma, alice.id, soon(5_000));
    expect(first).toEqual({ checked: 2, created: 3 });
    const types = (await listSignals(prisma, alice.id)).map((signal) => signal.type).sort();
    expect(types).toEqual(["NEW_EMAIL", "NEW_RESEARCH_CLAIM", "OPPORTUNITY_STAGE_CHANGED"]);

    await prisma.watchlistItem.updateMany({ where: { userId: alice.id }, data: { lastCheckedAt: new Date(0) } });
    expect(await refreshWatchSignals(prisma, alice.id, soon(6_000))).toEqual({ checked: 2, created: 0 });

    expect(await listSignals(prisma, bob.id)).toEqual([]);
    await expect(addToWatchlist(prisma, bob, { entityType: "CONTACT", targetId: contact.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe("IC memos against PostgreSQL", () => {
  it("allocates distinct versions under concurrency and finalizes exactly once", async () => {
    const opportunity = await createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Memo Co" } }));
    const memos = await Promise.all([1, 2, 3].map(() => generateInvestmentMemo(prisma, alice, opportunity.id)));
    expect(memos.map((memo) => memo.version).sort()).toEqual([1, 2, 3]);

    await expect(finalizeInvestmentMemo(prisma, bob, memos[0]!.id, null)).rejects.toMatchObject({ status: 404 });
    await finalizeInvestmentMemo(prisma, alice, memos[0]!.id, "Reviewed with the partnership.");
    await expect(finalizeInvestmentMemo(prisma, alice, memos[0]!.id, null)).rejects.toMatchObject({ status: 409, code: "MEMO_ALREADY_FINALIZED" });
    const events = await prisma.opportunityEvent.findMany({ where: { opportunityId: opportunity.id }, select: { type: true } });
    expect(events.filter((event) => event.type === "MEMO_GENERATED")).toHaveLength(3);
    expect(events.filter((event) => event.type === "MEMO_FINALIZED")).toHaveLength(1);
  });
});
