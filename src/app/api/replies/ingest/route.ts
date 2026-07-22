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
    const classification = classifyReply(parsed.data.bodySnippet);
    const reply = await prisma.reply.create({
      data: {
        userId: user.id,
        contactId: parsed.data.contactId,
        draftId: parsed.data.draftId,
        gmailMessageId: parsed.data.gmailMessageId,
        bodySnippet: parsed.data.bodySnippet,
        classification: classification.classification,
        confidence: classification.confidence,
        requiresHumanReview: classification.requiresHumanReview,
      },
    });

    if (parsed.data.draftId) {
      await prisma.outreachDraft.updateMany({
        where: { id: parsed.data.draftId, userId: user.id },
        data: { status: OutreachStatus.RECEIVED_REPLY },
      });
    }

    await audit(prisma, {
      userId: user.id,
      actor: "LargeVCModel",
      action: "Reply classified",
      outcome: classification.requiresHumanReview ? "requires_human_review" : "completed",
      affectedContactId: parsed.data.contactId,
      dataSource: parsed.data.gmailMessageId ? "Gmail" : "User-provided reply text",
      details: `Reply classified as ${classification.classification} with ${classification.confidence}% confidence.`,
    });

    return ok({ reply, classification });
  } catch (error) {
    return serverError(error);
  }
}
