import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { createGoogleCalendarEvent } from "@/lib/google/calendar";
import { prisma } from "@/lib/prisma";

export const calendarBookingSchema = z
  .object({
    contactId: z.string().min(1).optional(),
    summary: z.string().min(2).max(160),
    description: z.string().max(2000).optional(),
    attendees: z.array(z.string().email()).min(1),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    createMeetLink: z.boolean().default(true),
    confirmCreate: z.literal(true),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "The event end time must be after its start time.",
    path: ["endsAt"],
  });

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = calendarBookingSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Explicit calendar confirmation is required", parsed.error.flatten());
    const contact = parsed.data.contactId
      ? await prisma.contact.findFirst({ where: { id: parsed.data.contactId, userId: user.id }, select: { id: true } })
      : null;
    if (parsed.data.contactId && !contact) return badRequest("Contact not found.");
    const event = await createGoogleCalendarEvent(prisma, user.id, parsed.data);
    const stored = await prisma.calendarEvent.create({
      data: {
        userId: user.id,
        contactId: contact?.id,
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
      affectedContactId: contact?.id,
      dataSource: "Google Calendar",
      details: "User explicitly confirmed calendar event creation.",
    });
    return ok({ event: stored });
  } catch (error) {
    return serverError(error);
  }
}
