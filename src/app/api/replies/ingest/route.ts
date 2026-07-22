import { z } from "zod";
import { demoSampleReplies } from "@/lib/demo/fixtures";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { classifyReply } from "@/lib/domain/replies";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  contactId: z.string().min(1),
  draftId: z.string().optional(),
  sampleType: z.string().optional(),
  body: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid reply request", parsed.error.flatten());
    const contact = await prisma.contact.findUnique({ where: { id: parsed.data.contactId } });
    if (!contact) return notFound("Founder contact not found");

    const body =
      parsed.data.body ??
      demoSampleReplies.find((reply) => reply.type === (parsed.data.sampleType ?? "interested"))?.body ??
      demoSampleReplies[0].body;
    const classification = classifyReply(body);
    const reply = await prisma.reply.create({
      data: {
        contactId: contact.id,
        draftId: parsed.data.draftId,
        body,
        classification: classification.classification,
        confidence: classification.confidence,
        requiresHumanReview: classification.requiresHumanReview,
      },
    });

    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        crmStatus:
          classification.classification === "interested"
            ? "Replied - Interested"
            : classification.requiresHumanReview
              ? "Human Review"
              : `Reply - ${classification.classification.replaceAll("_", " ")}`,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actor: "LargeVCModel Reply Agent",
        actorType: "agent",
        action: "Classified reply",
        affectedFounderId: contact.id,
        dataSource: "simulated_reply",
        details: `Reply classified as ${classification.classification} with ${classification.confidence}% confidence.`,
      },
    });

    return ok({ reply, classification });
  } catch (error) {
    return serverError(error);
  }
}
