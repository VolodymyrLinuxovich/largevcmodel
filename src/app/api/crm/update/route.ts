import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  contactId: z.string().min(1),
  notes: z.string().max(4000).optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
  relationshipStrength: z.number().min(0).max(10).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid contact update request", parsed.error.flatten());
    const existing = await prisma.contact.findFirst({ where: { id: parsed.data.contactId, userId: user.id } });
    if (!existing) return notFound("Contact not found");
    const contact = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        notes: parsed.data.notes,
        tags: parsed.data.tags,
        relationshipStrength: parsed.data.relationshipStrength,
      },
    });
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Contact updated",
      outcome: "completed",
      affectedContactId: contact.id,
      dataSource: "User-provided information",
      details: "User changed contact metadata.",
    });
    return ok({ contact });
  } catch (error) {
    return serverError(error);
  }
}
