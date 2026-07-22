import { OutreachStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { createGmailDraft } from "@/lib/google/gmail";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({ draftId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid Gmail draft request", body.error.flatten());
    const draft = await prisma.outreachDraft.findFirst({
      where: { id: body.data.draftId, userId: user.id },
      include: { contact: true, gmailThread: true },
    });
    if (!draft) return notFound("Outreach draft not found");
    if (draft.status !== OutreachStatus.APPROVED) return badRequest("Approve the draft before creating a Gmail draft.");
    if (!draft.contact.primaryEmail) return badRequest("The selected contact does not have an email address.");

    const gmailDraft = await createGmailDraft(prisma, user.id, {
      to: draft.contact.primaryEmail,
      subject: draft.subject,
      body: draft.body,
      threadId: draft.gmailThread?.providerThreadId,
    });
    const updated = await prisma.outreachDraft.update({
      where: { id: draft.id },
      data: {
        gmailDraftId: gmailDraft.id,
        gmailMessageId: gmailDraft.message?.id,
        status: OutreachStatus.GMAIL_DRAFT,
      },
    });
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Gmail draft created",
      outcome: "completed",
      affectedContactId: draft.contactId,
      dataSource: "Gmail",
      details: "A Gmail draft was created after user approval. It has not been sent.",
    });
    return ok({ draft: updated });
  } catch (error) {
    return serverError(error);
  }
}
