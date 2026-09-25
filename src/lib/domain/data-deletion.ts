import "server-only";

import { ContactInteractionType, ContactSource, IntegrationService, Prisma, type PrismaClient } from "@prisma/client";
import { refreshRelationshipHealth } from "./relationship-health-service";
import { rebuildContactInteractionSummary } from "./relationships";

export type ImportedDataset = "contacts" | "gmail" | "calendar";

const EMAIL_INTERACTIONS = [ContactInteractionType.EMAIL_SENT, ContactInteractionType.EMAIL_RECEIVED];

/**
 * Deletes one imported dataset and every record derived from it, then recomputes derived
 * relationship values for affected contacts. Returns the number of deleted records.
 */
export async function deleteImportedDataset(prisma: PrismaClient, userId: string, dataset: ImportedDataset) {
  if (dataset === "contacts") {
    const where = { userId, source: { in: [ContactSource.GOOGLE_CONTACTS, ContactSource.GMAIL] } };
    const result = await prisma.$transaction(async (tx) => {
      // Opportunity links cascade with the contact; keep the pipeline history truthful about why.
      const links = await tx.opportunityContact.findMany({
        where: { userId, contact: where },
        select: { opportunityId: true, contactId: true, role: true },
      });
      if (links.length) {
        await tx.opportunityEvent.createMany({
          data: links.map((link) => ({
            userId,
            opportunityId: link.opportunityId,
            type: "CONTACT_UNLINKED" as const,
            actor: "Data deletion",
            note: "Linked contact removed because imported contact data was deleted.",
            metadata: { contactId: link.contactId, role: link.role },
          })),
        });
      }
      return tx.contact.deleteMany({ where });
    });
    await prisma.integration.updateMany({
      where: { userId, service: { in: [IntegrationService.GOOGLE_CONTACTS, IntegrationService.GMAIL] } },
      data: { recordsProcessed: 0, syncCursor: Prisma.JsonNull },
    });
    return result.count;
  }

  if (dataset === "gmail") {
    const affected = await contactsWithInteractions(prisma, userId, EMAIL_INTERACTIONS);
    const [replies, outreachEvents, outreachDrafts, threads, interactions, edges] = await prisma.$transaction([
      prisma.reply.deleteMany({ where: { userId } }),
      prisma.outreachEvent.deleteMany({ where: { userId } }),
      prisma.outreachDraft.deleteMany({ where: { userId } }),
      prisma.gmailThread.deleteMany({ where: { userId } }),
      // Interactions carry Gmail subjects and snippets; edges are derived from them.
      prisma.contactInteraction.deleteMany({ where: { userId, type: { in: EMAIL_INTERACTIONS } } }),
      prisma.relationshipEdge.deleteMany({ where: { userId, source: "Gmail" } }),
      prisma.integration.updateMany({
        where: { userId, service: IntegrationService.GMAIL },
        data: { recordsProcessed: 0, syncCursor: Prisma.JsonNull },
      }),
    ]);
    await recomputeDerivedRelationshipData(prisma, userId, affected);
    return replies.count + outreachEvents.count + outreachDrafts.count + threads.count + interactions.count + edges.count;
  }

  const affected = await contactsWithInteractions(prisma, userId, [ContactInteractionType.CALENDAR_MEETING]);
  const [meetings, events, interactions, edges] = await prisma.$transaction([
    prisma.meeting.deleteMany({ where: { userId } }),
    prisma.calendarEvent.deleteMany({ where: { userId } }),
    prisma.contactInteraction.deleteMany({ where: { userId, type: ContactInteractionType.CALENDAR_MEETING } }),
    prisma.relationshipEdge.deleteMany({ where: { userId, source: "Google Calendar" } }),
    prisma.integration.updateMany({
      where: { userId, service: IntegrationService.GOOGLE_CALENDAR },
      data: { recordsProcessed: 0, syncCursor: Prisma.JsonNull },
    }),
  ]);
  await recomputeDerivedRelationshipData(prisma, userId, affected);
  return meetings.count + events.count + interactions.count + edges.count;
}

async function contactsWithInteractions(prisma: PrismaClient, userId: string, types: ContactInteractionType[]) {
  const rows = await prisma.contactInteraction.findMany({
    where: { userId, type: { in: types } },
    distinct: ["contactId"],
    select: { contactId: true },
  });
  return rows.map((row) => row.contactId);
}

/**
 * Health scores, snapshots, last-interaction dates and counts must not outlive the data they were
 * derived from. Snapshots are removed and stored health reset so the recalculation starts a new
 * baseline instead of reporting the deletion as a relationship change.
 */
async function recomputeDerivedRelationshipData(prisma: PrismaClient, userId: string, contactIds: string[]) {
  if (!contactIds.length) return;
  await prisma.$transaction([
    prisma.relationshipHealthSnapshot.deleteMany({ where: { userId, contactId: { in: contactIds } } }),
    prisma.contact.updateMany({
      where: { userId, id: { in: contactIds } },
      data: { healthScore: null, healthState: null, healthCalculatedAt: null, nextFollowUpAt: null },
    }),
  ]);
  await rebuildContactInteractionSummary(prisma, userId, contactIds);
  await refreshRelationshipHealth(prisma, userId, { contactIds });
}
