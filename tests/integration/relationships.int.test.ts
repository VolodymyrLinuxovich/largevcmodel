import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteImportedDataset } from "@/lib/domain/data-deletion";
import { refreshRelationshipHealth } from "@/lib/domain/relationship-health-service";
import { createOpportunitySchema } from "@/lib/pipeline/schemas";
import { createOpportunity, linkOpportunityContact } from "@/lib/pipeline/service";
import { createUser, deleteUsers, prisma } from "./db";

let alice: Awaited<ReturnType<typeof createUser>>;
let bob: Awaited<ReturnType<typeof createUser>>;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

beforeAll(async () => {
  alice = await createUser("alice-health");
  bob = await createUser("bob-health");
});

afterAll(async () => {
  await deleteUsers([alice.id, bob.id]);
  await prisma.$disconnect();
});

async function contactWithHistory(userId: string, label: string) {
  const contact = await prisma.contact.create({
    data: { userId, source: "GMAIL", fullName: label, primaryEmail: `${label}-${userId}@example.com`, lastInteractionAt: ago(2), interactionCount: 4 },
  });
  await prisma.contactInteraction.createMany({
    data: [
      { userId, contactId: contact.id, type: "EMAIL_SENT", providerId: `${label}-m1`, occurredAt: ago(2), metadata: { subject: "Private subject" } },
      { userId, contactId: contact.id, type: "EMAIL_RECEIVED", providerId: `${label}-m2`, occurredAt: ago(5) },
      { userId, contactId: contact.id, type: "EMAIL_SENT", providerId: `${label}-m3`, occurredAt: ago(20) },
      { userId, contactId: contact.id, type: "CALENDAR_MEETING", providerId: `${label}-e1`, occurredAt: ago(30) },
    ],
  });
  await prisma.relationshipEdge.create({
    data: {
      userId,
      fromNodeId: userId,
      fromNodeType: "user",
      toNodeId: contact.id,
      toNodeType: "contact",
      relationship: "Email communication",
      strength: 5,
      evidence: "A Gmail message exists.",
      source: "Gmail",
    },
  });
  return contact;
}

describe("relationship health persistence against PostgreSQL", () => {
  it("persists health, snapshots only on change, and ignores other users' contact IDs", async () => {
    const mine = await contactWithHistory(alice.id, "alice-founder");
    const theirs = await contactWithHistory(bob.id, "bob-founder");

    const first = await refreshRelationshipHealth(prisma, alice.id, { contactIds: [mine.id, theirs.id] });
    expect(first.calculated).toBe(1);
    const stored = await prisma.contact.findUniqueOrThrow({ where: { id: mine.id } });
    expect(stored.healthState).not.toBeNull();
    expect(stored.healthScore).toBeGreaterThan(0);
    expect(await prisma.contact.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ healthState: null });

    await refreshRelationshipHealth(prisma, alice.id, { contactIds: [mine.id], now: stored.healthCalculatedAt! });
    expect(await prisma.relationshipHealthSnapshot.count({ where: { contactId: mine.id } })).toBe(1);
  });

  it("removes Gmail-derived interactions and edges on deletion and rebuilds derived values", async () => {
    const mine = await contactWithHistory(alice.id, "alice-delete");
    const theirs = await contactWithHistory(bob.id, "bob-keep");
    await refreshRelationshipHealth(prisma, alice.id, { contactIds: [mine.id] });

    await deleteImportedDataset(prisma, alice.id, "gmail");

    const interactions = await prisma.contactInteraction.findMany({ where: { contactId: mine.id }, select: { type: true } });
    expect(interactions.map((item) => item.type)).toEqual(["CALENDAR_MEETING"]);
    expect(await prisma.relationshipEdge.count({ where: { userId: alice.id, source: "Gmail" } })).toBe(0);
    const rebuilt = await prisma.contact.findUniqueOrThrow({ where: { id: mine.id } });
    expect(rebuilt.interactionCount).toBe(1);
    expect(rebuilt.lastInteractionAt?.getTime()).toBeLessThan(ago(29).getTime());
    const latest = await prisma.relationshipHealthSnapshot.findFirst({ where: { contactId: mine.id }, orderBy: { calculatedAt: "desc" } });
    expect(latest?.evidence).not.toContainEqual(expect.objectContaining({ kind: "EMAIL_SENT" }));

    expect(await prisma.contactInteraction.count({ where: { contactId: theirs.id } })).toBe(4);
    expect(await prisma.relationshipEdge.count({ where: { userId: bob.id, toNodeId: theirs.id, source: "Gmail" } })).toBe(1);
  });

  it("records pipeline history when deleting imported contacts removes linked people", async () => {
    const founder = await contactWithHistory(alice.id, "alice-linked");
    const opportunity = await createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Linked Co" } }));
    await linkOpportunityContact(prisma, alice, opportunity.id, { contactId: founder.id, role: "FOUNDER" });

    await deleteImportedDataset(prisma, alice.id, "contacts");

    expect(await prisma.opportunityContact.count({ where: { opportunityId: opportunity.id } })).toBe(0);
    const unlinked = await prisma.opportunityEvent.findFirst({ where: { opportunityId: opportunity.id, type: "CONTACT_UNLINKED" } });
    expect(unlinked).toMatchObject({ actor: "Data deletion", metadata: { contactId: founder.id, role: "FOUNDER" } });
    expect(await prisma.opportunity.count({ where: { id: opportunity.id } })).toBe(1);
  });
});
