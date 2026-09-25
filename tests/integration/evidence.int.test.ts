import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateMeetingBrief, getMeetingBrief } from "@/lib/briefs/service";
import { createOpportunitySchema } from "@/lib/pipeline/schemas";
import { createOpportunity, linkOpportunityContact } from "@/lib/pipeline/service";
import { createUser, deleteUsers, prisma } from "./db";

let alice: Awaited<ReturnType<typeof createUser>>;
let bob: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  alice = await createUser("alice-evidence");
  bob = await createUser("bob-evidence");
});

afterAll(async () => {
  await deleteUsers([alice.id, bob.id]);
  await prisma.$disconnect();
});

async function addClaim(userId: string, companyId: string, text: string, url: string) {
  const source = await prisma.source.create({
    data: { userId, companyId, title: text, url, canonicalUrl: url, accessedAt: new Date(), sourceType: "news", origin: "hermes" },
  });
  return prisma.researchClaim.create({
    data: { userId, companyId, text, category: "revenue", provenance: "PUBLIC_RESEARCH", sources: { create: { sourceId: source.id, supportedClaim: text } } },
  });
}

describe("meeting briefs against PostgreSQL", () => {
  it("assembles only the owner's evidence and stores a reviewable snapshot", async () => {
    const mine = await createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Same Name Robotics" } }));
    const theirs = await createOpportunity(prisma, bob, createOpportunitySchema.parse({ company: { name: "Same Name Robotics" } }));
    await addClaim(alice.id, mine.companyId, "Alice's sourced revenue claim", "https://alice.example/revenue");
    await addClaim(bob.id, theirs.companyId, "Bob's private revenue claim", "https://bob.example/revenue");

    const founder = await prisma.contact.create({ data: { userId: alice.id, source: "MANUAL", fullName: "Founder", primaryEmail: "founder@same.example" } });
    await linkOpportunityContact(prisma, alice, mine.id, { contactId: founder.id, role: "FOUNDER" });
    await prisma.gmailThread.create({
      data: { userId: bob.id, providerThreadId: "bob-thread", subject: "Bob's thread with the founder", participantEmails: ["founder@same.example"] },
    });
    await prisma.gmailThread.create({
      data: { userId: alice.id, providerThreadId: "alice-thread", subject: "Alice intro thread", participantEmails: ["founder@same.example"], messageCount: 2 },
    });

    const brief = await generateMeetingBrief(prisma, alice, mine.id);
    const stored = await getMeetingBrief(prisma, alice.id, brief.id);
    const content = stored!.content;

    expect(content.facts.research.map((item) => item.text)).toEqual(["Alice's sourced revenue claim"]);
    expect(content.facts.keyFacts.find((fact) => fact.key === "revenue")?.status).toBe("ESTABLISHED");
    expect(content.facts.relationshipHistory.emails.map((item) => item.text)).toEqual(["Alice intro thread (2 messages)"]);
    expect(content.sources.map((source) => source.url)).toEqual(["https://alice.example/revenue"]);
    expect(await getMeetingBrief(prisma, bob.id, brief.id)).toBeNull();
  });

  it("rejects another user's opportunity or calendar event", async () => {
    const mine = await createOpportunity(prisma, alice, createOpportunitySchema.parse({ company: { name: "Calendar Scope Co" } }));
    const bobEvent = await prisma.calendarEvent.create({
      data: { userId: bob.id, providerEventId: "bob-event", startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000) },
    });

    await expect(generateMeetingBrief(prisma, bob, mine.id)).rejects.toMatchObject({ status: 404 });
    const unrelated = await prisma.calendarEvent.create({
      data: { userId: alice.id, providerEventId: "alice-unrelated", attendees: ["someone@else.example"], startsAt: new Date(), endsAt: new Date() },
    });
    await expect(generateMeetingBrief(prisma, alice, mine.id, { calendarEventId: unrelated.id })).rejects.toMatchObject({
      status: 422,
      code: "MEETING_NOT_RELATED",
    });
    await expect(generateMeetingBrief(prisma, alice, mine.id, { calendarEventId: bobEvent.id })).rejects.toMatchObject({
      status: 404,
      code: "CALENDAR_EVENT_NOT_FOUND",
    });
    expect(await prisma.meetingBrief.count({ where: { opportunityId: mine.id } })).toBe(0);
  });
});
