import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { loadOpportunityEvidence } from "@/lib/evidence/loader";
import type { Actor } from "@/lib/pipeline/service";
import { assembleMeetingBrief, briefTitle, MEETING_BRIEF_VERSION, type MeetingBriefContent } from "./assemble";

export async function generateMeetingBrief(
  prisma: PrismaClient,
  actor: Actor,
  opportunityId: string,
  options: { calendarEventId?: string | null; now?: Date } = {},
) {
  const bundle = await loadOpportunityEvidence(prisma, actor.id, opportunityId, options);
  const content = assembleMeetingBrief(bundle);
  const brief = await prisma.meetingBrief.create({
    data: {
      userId: actor.id,
      opportunityId,
      calendarEventId: bundle.targetMeeting?.id ?? null,
      title: briefTitle(bundle),
      content: content as unknown as Prisma.InputJsonObject,
      version: MEETING_BRIEF_VERSION,
      claimCount: content.counts.claims,
      sourceCount: content.counts.sources,
      generatedAt: bundle.now,
    },
    select: { id: true, title: true, generatedAt: true },
  });
  await audit(prisma, {
    userId: actor.id,
    actor: "LargeVCModel",
    action: "Meeting brief generated",
    outcome: "completed",
    dataSource: "Stored claims, sources, Gmail, Calendar and pipeline records",
    details: `${content.counts.claims} claims, ${content.counts.sources} sources, ${content.missingInformation.length} missing-information items.`,
    metadata: { opportunityId, briefId: brief.id, requestedBy: actor.email },
  });
  return brief;
}

export async function getMeetingBrief(prisma: PrismaClient, userId: string, briefId: string) {
  const brief = await prisma.meetingBrief.findFirst({
    where: { id: briefId, userId },
    select: { id: true, title: true, opportunityId: true, version: true, generatedAt: true, content: true },
  });
  if (!brief) return null;
  if (brief.version !== MEETING_BRIEF_VERSION) {
    throw new ApiError(422, `Stored brief format ${brief.version} is not supported by this version of LargeVCModel.`, "UNSUPPORTED_BRIEF_VERSION");
  }
  return { ...brief, content: brief.content as unknown as MeetingBriefContent };
}

export function listMeetingBriefs(prisma: PrismaClient, userId: string, opportunityId: string) {
  return prisma.meetingBrief.findMany({
    where: { userId, opportunityId },
    orderBy: { generatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, generatedAt: true, claimCount: true, sourceCount: true },
  });
}

/** Upcoming calendar events that include a linked person, offered as brief targets. */
export async function upcomingMeetingsForOpportunity(prisma: PrismaClient, userId: string, opportunityId: string, now = new Date()) {
  const links = await prisma.opportunityContact.findMany({
    where: { userId, opportunityId },
    select: { contact: { select: { id: true, primaryEmail: true, emails: true } } },
  });
  const contactIds = links.map((link) => link.contact.id);
  const emails = Array.from(new Set(links.flatMap((link) => [link.contact.primaryEmail, ...link.contact.emails]).filter((email): email is string => Boolean(email))));
  if (!contactIds.length) return [];
  return prisma.calendarEvent.findMany({
    where: {
      userId,
      startsAt: { gt: now },
      OR: [{ contactId: { in: contactIds } }, ...(emails.length ? [{ attendees: { hasSome: emails } }] : [])],
    },
    orderBy: { startsAt: "asc" },
    take: 10,
    select: { id: true, title: true, startsAt: true },
  });
}
