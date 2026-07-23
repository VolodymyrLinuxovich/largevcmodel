import "server-only";

import { ContactInteractionType, IntegrationService, Prisma, PrismaClient } from "@prisma/client";
import { googleFetch, getConnectedIntegration } from "./api";
import { audit } from "@/lib/audit";
import { recalculateRelationshipStrength } from "@/lib/domain/relationships";

type CalendarEventsResponse = {
  nextPageToken?: string;
  items?: Array<{
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ uri?: string }> };
    attendees?: Array<{ email?: string }>;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    status?: string;
  }>;
};

type FreeBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
};

type CalendarInsertResponse = {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ uri?: string }> };
};

function eventDate(value?: { dateTime?: string; date?: string }) {
  if (!value?.dateTime && !value?.date) return null;
  return new Date(value.dateTime ?? `${value.date}T00:00:00.000Z`);
}

export async function syncGoogleCalendar(
  prisma: PrismaClient,
  userId: string,
  options: { pageToken?: string | null; maxResults?: number } = {},
) {
  const integration = await getConnectedIntegration(prisma, userId, IntegrationService.GOOGLE_CALENDAR);
  await prisma.integration.update({ where: { id: integration.id }, data: { syncStatus: "syncing", lastError: null } });

  try {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString());
    url.searchParams.set("timeMax", new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString());
    url.searchParams.set("maxResults", String(options.maxResults ?? 100));
    if (options.pageToken) url.searchParams.set("pageToken", options.pageToken);
    const payload = await googleFetch<CalendarEventsResponse>(prisma, userId, IntegrationService.GOOGLE_CALENDAR, url.toString());

    let imported = 0;
    for (const event of payload.items ?? []) {
      const startsAt = eventDate(event.start);
      const endsAt = eventDate(event.end);
      if (!startsAt || !endsAt) continue;
      const attendees = (event.attendees ?? []).map((attendee) => attendee.email).filter(Boolean) as string[];
      const matchingContact = attendees.length
        ? await prisma.contact.findFirst({ where: { userId, primaryEmail: { in: attendees.map((email) => email.toLowerCase()) } } })
        : null;
      const existingEvent = await prisma.calendarEvent.findUnique({
        where: { userId_calendarId_providerEventId: { userId, calendarId: "primary", providerEventId: event.id } },
        select: { id: true },
      });

      await prisma.calendarEvent.upsert({
        where: { userId_calendarId_providerEventId: { userId, calendarId: "primary", providerEventId: event.id } },
        create: {
          userId,
          contactId: matchingContact?.id,
          providerEventId: event.id,
          title: event.summary ?? null,
          description: event.description ?? null,
          location: event.location ?? null,
          htmlLink: event.htmlLink ?? null,
          meetingUrl: event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri ?? null,
          attendees,
          startsAt,
          endsAt,
          status: event.status ?? null,
        },
        update: {
          contactId: matchingContact?.id,
          title: event.summary ?? null,
          description: event.description ?? null,
          location: event.location ?? null,
          htmlLink: event.htmlLink ?? null,
          meetingUrl: event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri ?? null,
          attendees,
          startsAt,
          endsAt,
          status: event.status ?? null,
        },
      });
      if (matchingContact) {
        await prisma.contact.update({
          where: { id: matchingContact.id },
          data: {
            interactionCount: existingEvent ? undefined : { increment: 1 },
            lastInteractionAt: startsAt,
          },
        });
        await prisma.contactInteraction.upsert({
          where: {
            userId_type_providerId: {
              userId,
              type: ContactInteractionType.CALENDAR_MEETING,
              providerId: event.id,
            },
          },
          create: {
            userId,
            contactId: matchingContact.id,
            type: ContactInteractionType.CALENDAR_MEETING,
            providerId: event.id,
            occurredAt: startsAt,
            metadata: {
              title: event.summary ?? null,
              attendeeEmails: attendees,
              htmlLink: event.htmlLink ?? null,
            } as Prisma.InputJsonObject,
          },
          update: {
            contactId: matchingContact.id,
            occurredAt: startsAt,
          },
        });
        await prisma.relationshipEdge.upsert({
          where: {
            userId_fromNodeId_toNodeId_relationship_source: {
              userId,
              fromNodeId: userId,
              toNodeId: matchingContact.id,
              relationship: "Calendar meeting",
              source: "Google Calendar",
            },
          },
          create: {
            userId,
            fromNodeId: userId,
            fromNodeLabel: integration.accountEmail,
            fromNodeType: "user",
            toNodeId: matchingContact.id,
            toNodeLabel: matchingContact.fullName ?? matchingContact.primaryEmail,
            toNodeType: "contact",
            relationship: "Calendar meeting",
            strength: 7,
            evidence: "A Google Calendar event includes this contact as an attendee.",
            source: "Google Calendar",
            sourceRecordId: event.id,
          },
          update: {
            toNodeLabel: matchingContact.fullName ?? matchingContact.primaryEmail,
            evidence: "A Google Calendar event includes this contact as an attendee.",
            sourceRecordId: event.id,
          },
        });
        await recalculateRelationshipStrength(prisma, userId, matchingContact.id);
      }
      imported += 1;
    }

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        syncStatus: payload.nextPageToken ? "queued" : "idle",
        syncCursor: payload.nextPageToken ? ({ pageToken: payload.nextPageToken } as Prisma.InputJsonObject) : Prisma.JsonNull,
        recordsProcessed: { increment: imported },
        lastSyncedAt: payload.nextPageToken ? integration.lastSyncedAt : new Date(),
        lastError: null,
      },
    });
    await audit(prisma, {
      userId,
      actor: "Google Calendar sync",
      action: "Calendar events imported",
      outcome: "completed",
      dataSource: "Google Calendar",
      details: `${imported} events processed from the primary calendar.${payload.nextPageToken ? " More pages remain." : ""}`,
    });
    return { imported, nextPageToken: payload.nextPageToken ?? null, done: !payload.nextPageToken };
  } catch (error) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: "error", lastError: error instanceof Error ? error.message : "Unknown Calendar sync error" },
    });
    throw error;
  }
}

export async function getGoogleAvailability(
  prisma: PrismaClient,
  userId: string,
  input: { timeMin: string; timeMax: string; timezone?: string },
) {
  return googleFetch<FreeBusyResponse>(
    prisma,
    userId,
    IntegrationService.GOOGLE_CALENDAR,
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      body: JSON.stringify({
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        timeZone: input.timezone ?? "America/Los_Angeles",
        items: [{ id: "primary" }],
      }),
    },
  );
}

export async function createGoogleCalendarEvent(
  prisma: PrismaClient,
  userId: string,
  input: {
    summary: string;
    description?: string;
    attendees: string[];
    startsAt: string;
    endsAt: string;
    createMeetLink?: boolean;
  },
) {
  return googleFetch<CalendarInsertResponse>(
    prisma,
    userId,
    IntegrationService.GOOGLE_CALENDAR,
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        attendees: input.attendees.map((email) => ({ email })),
        start: { dateTime: input.startsAt },
        end: { dateTime: input.endsAt },
        conferenceData: input.createMeetLink
          ? {
              createRequest: {
                requestId: `largevcmodel-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            }
          : undefined,
      }),
    },
  );
}
