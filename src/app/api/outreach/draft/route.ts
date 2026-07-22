import { OutreachStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { generateOutreachDraft } from "@/lib/domain/outreach";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  contactId: z.string().min(1),
  format: z.enum(["email", "linkedin"]).default("email"),
  tone: z.enum(["direct", "warm", "technical"]).default("direct"),
  version: z.enum(["short", "long"]).default("short"),
  goal: z.string().min(2).max(240).default("start a focused conversation"),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid outreach draft request", body.error.flatten());
    const contact = await prisma.contact.findFirst({ where: { id: body.data.contactId, userId: user.id } });
    if (!contact) return notFound("Contact not found");

    const sources = await prisma.source.findMany({
      where: { userId: user.id, contactId: contact.id },
      orderBy: { accessedAt: "desc" },
      take: 8,
    });
    const generated = generateOutreachDraft(contact, sources, { ...body.data, senderName: user.name });
    const draft = await prisma.outreachDraft.create({
      data: {
        userId: user.id,
        contactId: contact.id,
        format: generated.format,
        tone: generated.tone,
        goal: generated.goal,
        subject: generated.subject,
        body: generated.body,
        rationale: JSON.stringify({
          summary: generated.rationale,
          claims: generated.rationaleClaims,
          warning: generated.warning,
        }),
        evidenceSourceIds: generated.rationaleClaims.map((claim) => claim.sourceId),
        status: OutreachStatus.AI_GENERATED,
      },
    });

    await prisma.outreachEvent.create({
      data: {
        userId: user.id,
        draftId: draft.id,
        contactId: contact.id,
        type: "draft_generated",
        actor: "LargeVCModel",
        note: "Generated an approval-required draft using available evidence only.",
      },
    });
    await audit(prisma, {
      userId: user.id,
      actor: "LargeVCModel",
      action: "Outreach draft generated",
      outcome: "completed",
      affectedContactId: contact.id,
      dataSource: "Workspace evidence",
      details: "Draft remains unsent until explicit approval and Gmail send.",
    });

    return ok({ draft: { ...draft, rationaleParsed: JSON.parse(draft.rationale ?? "{}") } });
  } catch (error) {
    return serverError(error);
  }
}
