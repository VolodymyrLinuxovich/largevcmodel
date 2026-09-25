import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOpportunitySchema } from "@/lib/pipeline/schemas";
import { listPipeline, getOpportunityDetail } from "@/lib/pipeline/queries";
import { changeOpportunityStage, createOpportunity, linkOpportunityContact, scoreOpportunity } from "@/lib/pipeline/service";
import { createUser, deleteUsers, prisma } from "./db";

let alice: Awaited<ReturnType<typeof createUser>>;
let bob: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  alice = await createUser("alice");
  bob = await createUser("bob");
});

afterAll(async () => {
  await deleteUsers([alice.id, bob.id]);
  await prisma.$disconnect();
});

describe("opportunity pipeline against PostgreSQL", () => {
  it("enforces one open opportunity per company and allows a new one after the first closes", async () => {
    const first = await createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Orbital Labs" } }));

    await expect(createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Orbital Labs" } }))).rejects.toMatchObject({
      status: 409,
      code: "OPEN_OPPORTUNITY_EXISTS",
      details: { opportunityId: first.id },
    });

    await changeOpportunityStage(prisma, alice, first.id, { toStage: "PASSED", passReason: "Outside thesis", expectedVersion: 1 });
    const second = await createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Orbital Labs" } }));
    expect(second.companyId).toBe(first.companyId);

    await expect(
      changeOpportunityStage(prisma, alice, first.id, { toStage: "SCREENING", note: "Reconsidering", expectedVersion: 2 }),
    ).rejects.toMatchObject({ status: 409, code: "OPEN_OPPORTUNITY_EXISTS" });
  });

  it("isolates users: the same company name is separate per user and foreign IDs are not found", async () => {
    const mine = await createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Shared Name Inc" } }));
    const theirs = await createOpportunity(prisma, bob, createOpportunitySchema.parse({ company: { name: "Shared Name Inc" } }));

    expect(mine.companyId).not.toBe(theirs.companyId);
    expect(await getOpportunityDetail(prisma, bob.id, mine.id)).toBeNull();
    expect((await listPipeline(prisma, bob.id)).map((card) => card.id)).not.toContain(mine.id);
    await expect(changeOpportunityStage(prisma, bob, mine.id, { toStage: "SCREENING", expectedVersion: 1 })).rejects.toMatchObject({ status: 404 });

    const aliceContact = await prisma.contact.create({ data: { userId: alice.id, source: "MANUAL", fullName: "Alice's founder" } });
    await expect(linkOpportunityContact(prisma, bob, theirs.id, { contactId: aliceContact.id, role: "FOUNDER" })).rejects.toMatchObject({
      status: 404,
      code: "CONTACT_NOT_FOUND",
    });
  });

  it("guards concurrent stage changes with the version counter and records history", async () => {
    const opportunity = await createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Race Condition Co" } }));
    const results = await Promise.allSettled([
      changeOpportunityStage(prisma, alice, opportunity.id, { toStage: "SCREENING", expectedVersion: 1 }),
      changeOpportunityStage(prisma, alice, opportunity.id, { toStage: "MEETING", expectedVersion: 1 }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const detail = await getOpportunityDetail(prisma, alice.id, opportunity.id);
    expect(detail?.version).toBe(2);
    expect(detail?.events.map((event) => event.type)).toEqual(["STAGE_CHANGED", "CREATED"]);
  });

  it("scores using live relationship health, ignoring a stale stored value", async () => {
    const opportunity = await createOpportunity(
      prisma,
      alice,
      createOpportunitySchema.parse({ company: { name: "Scored Co", sector: "Climate", stage: "Seed" } }),
    );
    // The stored value claims a strong relationship, but there is no interaction evidence behind it.
    const stale = await prisma.contact.create({
      data: { userId: alice.id, source: "MANUAL", fullName: "Stale", healthScore: 95, healthState: "STRENGTHENING" },
    });
    const founder = await prisma.contact.create({ data: { userId: alice.id, source: "MANUAL", fullName: "Founder" } });
    const day = 86_400_000;
    await prisma.contactInteraction.createMany({
      data: [
        { userId: alice.id, contactId: founder.id, type: "EMAIL_SENT", providerId: "score-1", occurredAt: new Date(Date.now() - 3 * day) },
        { userId: alice.id, contactId: founder.id, type: "EMAIL_RECEIVED", providerId: "score-2", occurredAt: new Date(Date.now() - 2 * day) },
      ],
    });
    await linkOpportunityContact(prisma, alice, opportunity.id, { contactId: stale.id, role: "ADVISOR" });
    await linkOpportunityContact(prisma, alice, opportunity.id, { contactId: founder.id, role: "FOUNDER" });

    const score = await scoreOpportunity(prisma, alice, opportunity.id);
    expect(score.evidence).toMatchObject({ relationshipContactId: founder.id });
    const detail = await getOpportunityDetail(prisma, alice.id, opportunity.id);
    expect(detail?.currentFitScoreId).toBe(score.id);
    expect(detail?.relationship).toMatchObject({ status: "ASSESSED", strongest: { contactId: founder.id } });
    expect(detail?.contacts.find((link) => link.contact.id === stale.id)?.health.healthState).toBe("INSUFFICIENT_DATA");
  });

  it("deletes all of a user's pipeline data when the user is deleted", async () => {
    const temp = await createUser("temp");
    await createOpportunity(prisma, temp, createOpportunitySchema.parse({ company: { name: "Ephemeral" } }));
    await deleteUsers([temp.id]);

    expect(await prisma.opportunity.count({ where: { userId: temp.id } })).toBe(0);
    expect(await prisma.company.count({ where: { userId: temp.id } })).toBe(0);
  });
});
