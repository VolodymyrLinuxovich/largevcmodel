import type { PrismaClient } from "@prisma/client";
import { canonicalizeUrl } from "../domain/sources";
import {
  demoCalendarSlots,
  demoCompanies,
  demoContacts,
  demoFounderProfiles,
  demoPartners,
  demoRelationshipEdges,
  demoSources,
  demoThesis,
  demoUsers,
} from "./fixtures";

function sourceIdFromUrl(url: string) {
  const slug = url.split("/").filter(Boolean).pop() ?? "source";
  return `source-${slug}`;
}

export async function resetDemoData(prisma: PrismaClient) {
  await prisma.claimSource.deleteMany();
  await prisma.fitScore.deleteMany();
  await prisma.researchClaim.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.reply.deleteMany();
  await prisma.outreachEvent.deleteMany();
  await prisma.outreachDraft.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.calendarSlot.deleteMany();
  await prisma.relationshipEdge.deleteMany();
  await prisma.source.deleteMany();
  await prisma.researchRun.deleteMany();
  await prisma.founderProfile.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
  await prisma.investmentThesis.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({ data: demoUsers });
  await prisma.partner.createMany({ data: demoPartners });
  await prisma.investmentThesis.create({ data: demoThesis });

  for (const company of demoCompanies) {
    await prisma.company.create({
      data: {
        ...company,
        latestFundingDate: company.latestFundingDate ? new Date(company.latestFundingDate) : null,
      },
    });
  }

  for (const contact of demoContacts) {
    await prisma.contact.create({
      data: {
        ...contact,
        sourceLabel: "Internal CRM",
        dataBoundary: "Seeded fictional demo data; not a real founder profile.",
      },
    });
  }

  for (const profile of demoFounderProfiles) {
    await prisma.founderProfile.create({ data: profile });
  }

  await prisma.relationshipEdge.createMany({ data: demoRelationshipEdges });

  for (const slot of demoCalendarSlots) {
    await prisma.calendarSlot.create({
      data: {
        ...slot,
        startTime: new Date(slot.startTime),
        endTime: new Date(slot.endTime),
      },
    });
  }

  const createdSources = new Map<string, string>();
  for (const source of demoSources) {
    const created = await prisma.source.create({
      data: {
        id: sourceIdFromUrl(source.url),
        title: source.title,
        url: source.url,
        canonicalUrl: canonicalizeUrl(source.url),
        publisher: source.publisher,
        publishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
        accessedAt: new Date(source.accessedAt),
        sourceType: source.sourceType,
        origin: source.origin,
        snippet: source.snippet,
        contactId: "contactId" in source ? source.contactId ?? null : null,
        companyId: "companyId" in source ? source.companyId ?? null : null,
        supportsClaims: JSON.stringify(source.supportsClaims),
      },
    });
    createdSources.set(source.url, created.id);
  }

  const internalSourceId = createdSources.get("/demo-sources/internal-crm-snapshot");
  for (const contact of demoContacts) {
    const company = demoCompanies.find((item) => item.id === contact.companyId);
    const claim = await prisma.researchClaim.create({
      data: {
        contactId: contact.id,
        companyId: contact.companyId,
        text: `${contact.fullName} is a seeded internal CRM contact associated with ${company?.name ?? "a demo company"}; relationship strength is ${contact.relationshipStrength}/10.`,
        category: "internal_crm",
        provenance: "internal_crm",
        confidence: 100,
      },
    });
    if (internalSourceId) {
      await prisma.claimSource.create({
        data: {
          claimId: claim.id,
          sourceId: internalSourceId,
          supportedClaim: claim.text,
        },
      });
    }
  }

  for (const source of demoSources.filter((item) => item.sourceType !== "internal_crm")) {
    const sourceId = createdSources.get(source.url);
    if (!sourceId) continue;
    for (const supportedClaim of source.supportsClaims) {
      const claim = await prisma.researchClaim.create({
        data: {
          contactId: "contactId" in source ? source.contactId ?? null : null,
          companyId: "companyId" in source ? source.companyId ?? null : null,
          text: supportedClaim,
          category: source.sourceType,
          provenance: source.origin === "mock" ? "public_source" : "internal_crm",
          confidence: source.origin === "mock" ? 82 : 100,
        },
      });
      await prisma.claimSource.create({
        data: {
          claimId: claim.id,
          sourceId,
          supportedClaim,
        },
      });
    }
  }

  const initialDraft = await prisma.outreachDraft.create({
    data: {
      contactId: "contact-samira-haddad",
      format: "email",
      tone: "concise",
      version: "short",
      subject: "ModelFrame and LLM release reliability",
      body:
        "Hi Samira,\n\nRina mentioned your work on LLM release regression testing after the governance roundtable. Northstar Seed spends a lot of time on AI infrastructure primitives, and ModelFrame's evaluation workflow looks close to a pain we keep hearing from portfolio engineering leaders.\n\nWould you be open to a 25-minute conversation next week?\n\nAva",
      rationale:
        "Personalized with seeded internal CRM context and demo public-source claims about ModelFrame's evaluation pipeline. This draft remains unapproved.",
      status: "Draft",
    },
  });

  await prisma.outreachEvent.create({
    data: {
      draftId: initialDraft.id,
      contactId: "contact-samira-haddad",
      type: "draft_created",
      actor: "LargeVCModel Demo Agent",
      note: "Initial draft created from a prior saved search; not approved or sent.",
      timestamp: new Date("2026-07-10T17:15:00.000Z"),
    },
  });

  await prisma.auditEvent.createMany({
    data: [
      {
        actor: "LargeVCModel Demo Agent",
        actorType: "agent",
        action: "Seeded demo data",
        dataSource: "internal_demo",
        details:
          "Loaded fictional founder, company, source, relationship, calendar, and outreach records. Public-looking artifacts are local demo sources.",
        timestamp: new Date("2026-07-22T16:00:00.000Z"),
      },
      {
        actor: "Ava Sterling",
        actorType: "user",
        action: "Saved AI infrastructure thesis",
        dataSource: "internal_crm",
        details:
          "Seed thesis prioritizes Bay Area seed-stage AI infrastructure and technical founder-market fit.",
        timestamp: new Date("2026-07-22T16:02:00.000Z"),
      },
    ],
  });

  return {
    contacts: demoContacts.length,
    companies: demoCompanies.length,
    sources: demoSources.length,
  };
}
