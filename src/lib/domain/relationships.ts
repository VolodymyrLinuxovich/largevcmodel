import "server-only";

import { ContactInteractionType, PrismaClient } from "@prisma/client";

function recencyPoints(lastInteractionAt: Date | null) {
  if (!lastInteractionAt) return 0;
  const ageDays = (Date.now() - lastInteractionAt.getTime()) / 86_400_000;
  if (ageDays <= 14) return 25;
  if (ageDays <= 45) return 18;
  if (ageDays <= 90) return 12;
  if (ageDays <= 180) return 6;
  return 2;
}

export async function recalculateRelationshipStrength(
  prisma: PrismaClient,
  userId: string,
  contactId: string,
) {
  const [contact, interactionCounts, upcomingMeetings] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, userId }, select: { lastInteractionAt: true } }),
    prisma.contactInteraction.groupBy({
      by: ["type"],
      where: { userId, contactId },
      _count: { id: true },
    }),
    prisma.calendarEvent.count({
      where: { userId, contactId, startsAt: { gte: new Date() } },
    }),
  ]);

  if (!contact) return null;

  const countFor = (type: ContactInteractionType) =>
    interactionCounts.find((item) => item.type === type)?._count.id ?? 0;

  const sent = countFor(ContactInteractionType.EMAIL_SENT);
  const received = countFor(ContactInteractionType.EMAIL_RECEIVED);
  const meetings = countFor(ContactInteractionType.CALENDAR_MEETING);
  const imported = countFor(ContactInteractionType.CONTACT_IMPORTED);
  const frequency = Math.min(25, sent * 2 + received * 3);
  const meetingScore = Math.min(25, meetings * 8 + upcomingMeetings * 10);
  const sourceScore = imported ? 5 : 0;
  const overall = Math.max(0, Math.min(100, recencyPoints(contact.lastInteractionAt) + frequency + meetingScore + sourceScore));

  await prisma.contact.update({
    where: { id: contactId },
    data: { relationshipStrength: overall },
  });

  return {
    overall,
    evidence: {
      emailsSent: sent,
      emailsReceived: received,
      calendarMeetings: meetings,
      upcomingMeetings,
      importedContactRecord: imported > 0,
      lastInteractionAt: contact.lastInteractionAt,
    },
  };
}
