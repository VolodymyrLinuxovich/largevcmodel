import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";

const requestSchema = z.object({
  contactId: z.string().min(1),
  partnerId: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid meeting create request", parsed.error.flatten());
    const contact = await prisma.contact.findUnique({
      where: { id: parsed.data.contactId },
      include: { company: true },
    });
    if (!contact) return notFound("Founder contact not found");

    const meeting = await prisma.meeting.create({
      data: {
        contactId: contact.id,
        partnerId: parsed.data.partnerId,
        title: `${contact.company?.name ?? contact.fullName} intro and thesis fit`,
        startTime: new Date(parsed.data.startTime),
        endTime: new Date(parsed.data.endTime),
        meetingUrl: `https://meet.example.com/largevcmodel-demo-${Date.now().toString(36)}`,
        status: "Booked",
      },
      include: { contact: { include: { company: true } }, partner: true },
    });
    await prisma.contact.update({
      where: { id: contact.id },
      data: { crmStatus: "Meeting Booked" },
    });
    await prisma.auditEvent.create({
      data: {
        actor: "LargeVCModel MeetingLink Agent",
        actorType: "agent",
        action: "Created mock meeting",
        affectedFounderId: contact.id,
        dataSource: "simulation",
        details: `Booked simulated meeting and generated mock URL ${meeting.meetingUrl}.`,
      },
    });
    return ok({ meeting });
  } catch (error) {
    return serverError(error);
  }
}
