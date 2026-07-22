import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { createGoogleCalendarEvent } from "@/lib/google/calendar";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  contactId: z.string().min(1).optional(),
  summary: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  attendees: z.array(z.string().email()).min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  createMeetLink: z.boolean().default(true),
  confirmCreate: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Explicit calendar confirmation is required", parsed.error.flatten());
    const event = await createGoogleCalendarEvent(prisma, user.id, parsed.data);
    const stored = await prisma.calendarEvent.create({
      data: {
        userId: user.id,
        contactId: parsed.data.contactId,
        providerEventId: event.id,
        calendarId: "primary",
        title: parsed.data.summary,
        description: parsed.data.description,
        htmlLink: event.htmlLink ?? null,
        meetingUrl: event.hangoutLink ?? event.conferenceData?.entryPoints?.find((entry) => entry.uri)?.uri ?? null,
        attendees: parsed.data.attendees,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
        status: "confirmed",
      },
    });
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Calendar event created",
      outcome: "completed",
      affectedContactId: parsed.data.contactId,
      dataSource: "Google Calendar",
      details: "User explicitly confirmed calendar event creation.",
    });
    return ok({ event: stored });
  } catch (error) {
    return serverError(error);
  }
}
