import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";

const requestSchema = z.object({
  draftId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid approval request", body.error.flatten());
    const draft = await prisma.outreachDraft.update({
      where: { id: body.data.draftId },
      data: { status: "Approved", approvedAt: new Date() },
    }).catch(() => null);
    if (!draft) return notFound("Outreach draft not found");

    await prisma.outreachEvent.create({
      data: {
        draftId: draft.id,
        contactId: draft.contactId,
        type: "approved",
        actor: "Ava Sterling",
        note: "Partner approved simulated outreach.",
      },
    });
    await prisma.auditEvent.create({
      data: {
        actor: "Ava Sterling",
        actorType: "user",
        action: "Approved outreach",
        affectedFounderId: draft.contactId,
        researchRunId: draft.researchRunId,
        dataSource: "human_approval",
        details: "Outreach moved from Draft to Approved. No external message was sent yet.",
      },
    });
    return ok({ draft });
  } catch (error) {
    return serverError(error);
  }
}
