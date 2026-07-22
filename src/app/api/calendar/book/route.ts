import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";

const requestSchema = z.object({
  slotId: z.string().min(1),
  contactId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid calendar booking request", parsed.error.flatten());
    const slot = await prisma.calendarSlot.findUnique({
      where: { id: parsed.data.slotId },
      include: { partner: true },
    });
    if (!slot) return notFound("Calendar slot not found");
    if (slot.status !== "available") return badRequest("Calendar slot is no longer available.");

    const updated = await prisma.calendarSlot.update({
      where: { id: slot.id },
      data: { status: "held" },
      include: { partner: true },
    });
    await prisma.auditEvent.create({
      data: {
        actor: "LargeVCModel Scheduling Agent",
        actorType: "agent",
        action: "Held calendar slot",
        affectedFounderId: parsed.data.contactId,
        dataSource: "calendar_cache",
        details: `Held ${slot.partner.name}'s slot ${slot.startTime.toISOString()} for simulated scheduling.`,
      },
    });
    return ok({ slot: updated });
  } catch (error) {
    return serverError(error);
  }
}
