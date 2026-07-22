import { OutreachStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { sendGmailDraft } from "@/lib/google/gmail";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  draftId: z.string().min(1),
  confirmSend: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Explicit send confirmation is required", body.error.flatten());
    const existing = await prisma.outreachDraft.findFirst({ where: { id: body.data.draftId, userId: user.id } });
    if (!existing) return notFound("Outreach draft not found");
    if (existing.status !== OutreachStatus.GMAIL_DRAFT || !existing.gmailDraftId) {
      return badRequest("Create and review a Gmail draft before sending.");
    }

    const sent = await sendGmailDraft(prisma, user.id, existing.gmailDraftId);
    const draft = await prisma.outreachDraft.update({
      where: { id: existing.id },
      data: {
        status: OutreachStatus.SENT,
        sentAt: new Date(),
        gmailMessageId: sent.message?.id ?? existing.gmailMessageId,
      },
    });
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Email sent",
      outcome: "completed",
      affectedContactId: draft.contactId,
      dataSource: "Gmail",
      details: "User explicitly confirmed sending a saved Gmail draft.",
    });
    return ok({ draft });
  } catch (error) {
    return serverError(error);
  }
}
