import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";

const requestSchema = z.object({
  contactId: z.string().min(1),
  status: z.string().min(2),
  details: z.string().min(2).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid CRM update request", parsed.error.flatten());
    const contact = await prisma.contact.update({
      where: { id: parsed.data.contactId },
      data: { crmStatus: parsed.data.status },
    }).catch(() => null);
    if (!contact) return notFound("Founder contact not found");
    await prisma.auditEvent.create({
      data: {
        actor: "LargeVCModel CRM Update Agent",
        actorType: "agent",
        action: "Updated CRM state",
        affectedFounderId: contact.id,
        dataSource: "internal_crm",
        details: parsed.data.details ?? `Status changed to ${parsed.data.status}.`,
      },
    });
    return ok({ contact });
  } catch (error) {
    return serverError(error);
  }
}
