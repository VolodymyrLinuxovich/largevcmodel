import "server-only";

import { ContactSource, Prisma, type DiscoveredPerson, type PrismaClient } from "@prisma/client";
import { normalizeEmail } from "./normalization";

export async function enrichPersonRelationship(prisma: PrismaClient, userId: string, person: DiscoveredPerson) {
  const emails = Array.from(new Set(person.emailAddresses.map(normalizeEmail).filter(Boolean) as string[]));
  const organization = person.currentOrganizationName?.trim() || null;

  const contact = emails.length
    ? await prisma.contact.findFirst({
        where: {
          userId,
          OR: [{ primaryEmail: { in: emails } }, { emails: { hasSome: emails } }],
        },
        orderBy: [{ source: "asc" }, { lastInteractionAt: "desc" }],
      })
    : organization
      ? await prisma.contact.findFirst({
          where: {
            userId,
            fullName: { equals: person.fullName, mode: "insensitive" },
            organization: { equals: organization, mode: "insensitive" },
          },
        })
      : null;

  const allEmails = Array.from(new Set([...emails, ...(contact?.emails ?? []), contact?.primaryEmail].map(normalizeEmail).filter(Boolean) as string[]));
  const [threads, messages, meetings] = allEmails.length
    ? await Promise.all([
        prisma.gmailThread.findMany({
          where: { userId, participantEmails: { hasSome: allEmails } },
          select: { id: true, messageCount: true, lastMessageAt: true, hasUserReply: true },
          orderBy: { lastMessageAt: "desc" },
          take: 50,
        }),
        prisma.gmailMessage.findMany({
          where: { thread: { userId, participantEmails: { hasSome: allEmails } } },
          select: { direction: true, internalDate: true },
          take: 250,
        }),
        prisma.calendarEvent.findMany({
          where: { userId, attendees: { hasSome: allEmails } },
          select: { startsAt: true, endsAt: true, providerEventId: true },
          orderBy: { startsAt: "desc" },
          take: 25,
        }),
      ])
    : [[], [], []] as const;

  const dates = [
    ...threads.map((thread) => thread.lastMessageAt).filter(Boolean),
    ...messages.map((message) => message.internalDate).filter(Boolean),
    ...meetings.map((meeting) => meeting.startsAt).filter(Boolean),
    contact?.lastInteractionAt,
  ].filter(Boolean) as Date[];
  const mostRecentInteraction = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
  const firstInteraction = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
  const sent = messages.filter((message) => message.direction === "sent").length;
  const received = messages.filter((message) => message.direction === "received").length;
  const googleContactPresent = contact?.source === ContactSource.GOOGLE_CONTACTS;
  const relationshipStrength = relationshipScore({
    googleContactPresent,
    threadCount: threads.length,
    messageCount: messages.length,
    repliedThreads: threads.filter((thread) => thread.hasUserReply).length,
    meetingCount: meetings.length,
    mostRecentInteraction,
  });
  const evidence = {
    source: "connected_account_enrichment",
    safeSummaryOnly: true,
    emailsMatched: allEmails.length,
    gmailThreadCount: threads.length,
    messageCount: messages.length,
    calendarMeetingCount: meetings.length,
    googleContactPresent,
    mostRecentInteraction: mostRecentInteraction?.toISOString() ?? null,
  };

  return prisma.personRelationshipEnrichment.upsert({
    where: { userId_personId: { userId, personId: person.id } },
    create: {
      userId,
      personId: person.id,
      contactId: contact?.id ?? null,
      directEmailHistory: threads.length > 0,
      gmailThreadCount: threads.length,
      messageCount: messages.length,
      mostRecentInteraction,
      firstInteraction,
      inboundOutboundBalance: { sent, received } as Prisma.InputJsonObject,
      googleContactPresent,
      savedContactOrg: contact?.organization ?? null,
      knownAliases: allEmails,
      relationshipStrength,
      possibleIntroPath: Prisma.JsonNull,
      evidence: evidence as Prisma.InputJsonObject,
      confidence: allEmails.length ? 86 : 42,
    },
    update: {
      contactId: contact?.id ?? null,
      directEmailHistory: threads.length > 0,
      gmailThreadCount: threads.length,
      messageCount: messages.length,
      mostRecentInteraction,
      firstInteraction,
      inboundOutboundBalance: { sent, received } as Prisma.InputJsonObject,
      googleContactPresent,
      savedContactOrg: contact?.organization ?? null,
      knownAliases: allEmails,
      relationshipStrength,
      possibleIntroPath: Prisma.JsonNull,
      evidence: evidence as Prisma.InputJsonObject,
      confidence: allEmails.length ? 86 : 42,
      refreshedAt: new Date(),
    },
  });
}

function relationshipScore(input: {
  googleContactPresent: boolean;
  threadCount: number;
  messageCount: number;
  repliedThreads: number;
  meetingCount: number;
  mostRecentInteraction: Date | null;
}) {
  const recencyDays = input.mostRecentInteraction ? (Date.now() - input.mostRecentInteraction.getTime()) / 86_400_000 : Infinity;
  const recency = recencyDays <= 30 ? 22 : recencyDays <= 90 ? 16 : recencyDays <= 180 ? 10 : recencyDays <= 365 ? 6 : 0;
  return Math.min(
    100,
    (input.googleContactPresent ? 18 : 0) +
      Math.min(20, input.threadCount * 5) +
      Math.min(18, input.messageCount * 2) +
      Math.min(18, input.repliedThreads * 6) +
      Math.min(16, input.meetingCount * 8) +
      recency,
  );
}
