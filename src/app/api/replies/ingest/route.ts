import { OutreachStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { classifyReply } from "@/lib/domain/replies";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  contactId: z.string().min(1).optional(),
  draftId: z.string().min(1).optional(),
  gmailMessageId: z.string().min(1).optional(),
  bodySnippet: z.string().min(2).max(2000),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid reply request", parsed.error.flatten());
    const [contact, draft] = await Promise.all([
      parsed.data.contactId
        ? prisma.contact.findFirst({ where: { id: parsed.data.contactId, userId: user.id }, select: { id: true } })
        : Promise.resolve(null),
      parsed.data.draftId
        ? prisma.outreachDraft.findFirst({ where: { id: parsed.data.draftId, userId: user.id }, select: { id: true, contactId: true } })
        : Promise.resolve(null),
    ]);
    if (parsed.data.contactId && !contact) return badRequest("Contact not found.");
    if (parsed.data.draftId && !draft) return badRequest("Outreach draft not found.");
    if (contact && draft && draft.contactId !== contact.id) {
      return badRequest("The reply contact does not match the outreach draft contact.");
    }
    const classification = classifyReply(parsed.data.bodySnippet);
    const reply = await prisma.reply.create({
      data: {
        userId: user.id,
        contactId: contact?.id ?? draft?.contactId,
        draftId: draft?.id,
        gmailMessageId: parsed.data.gmailMessageId,
        bodySnippet: parsed.data.bodySnippet,
        classification: classification.classification,
        confidence: classification.confidence,
        requiresHumanReview: classification.requiresHumanReview,
      },
    });

    if (draft) {
      await prisma.outreachDraft.updateMany({
        where: { id: draft.id, userId: user.id },
        data: { status: OutreachStatus.RECEIVED_REPLY },
      });
    }

    await audit(prisma, {
      userId: user.id,
      actor: "LargeVCModel",
      action: "Reply classified",
      outcome: classification.requiresHumanReview ? "requires_human_review" : "completed",
      affectedContactId: contact?.id ?? draft?.contactId,
      dataSource: parsed.data.gmailMessageId ? "Gmail" : "User-provided reply text",
      details: `Reply classified as ${classification.classification} with ${classification.confidence}% confidence.`,
    });

    return ok({ reply, classification });
  } catch (error) {
    return serverError(error);
  }
}
