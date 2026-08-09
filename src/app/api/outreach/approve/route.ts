import { OutreachStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";
import { canApproveOutreachDraft } from "@/lib/domain/outreach";

const requestSchema = z.object({ draftId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid approval request", body.error.flatten());
    const existing = await prisma.outreachDraft.findFirst({ where: { id: body.data.draftId, userId: user.id } });
    if (!existing) return notFound("Outreach draft not found");
    if (!canApproveOutreachDraft(existing.status)) return badRequest("Only a newly generated draft can be approved.");

    const updated = await prisma.outreachDraft.updateMany({
      where: { id: existing.id, userId: user.id, status: OutreachStatus.AI_GENERATED },
      data: { status: OutreachStatus.APPROVED, approvedAt: new Date() },
    });
    if (updated.count !== 1) return badRequest("The draft status changed before it could be approved.");
    const draft = await prisma.outreachDraft.findUniqueOrThrow({ where: { id: existing.id } });
    await prisma.outreachEvent.create({
      data: { userId: user.id, draftId: draft.id, contactId: draft.contactId, type: "approved", actor: user.email },
    });
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Outreach approved",
      outcome: "completed",
      affectedContactId: draft.contactId,
      dataSource: "Human approval",
      details: "No external message was sent by approval alone.",
    });
    return ok({ draft });
  } catch (error) {
    return serverError(error);
  }
}
