import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";

const requestSchema = z.object({
  draftId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid send request", body.error.flatten());
    const existing = await prisma.outreachDraft.findUnique({ where: { id: body.data.draftId } });
    if (!existing) return notFound("Outreach draft not found");
    if (existing.status !== "Approved") return badRequest("Draft must be approved before simulated send.");

    const draft = await prisma.outreachDraft.update({
      where: { id: existing.id },
      data: { status: "Sent", sentAt: new Date() },
    });
    await prisma.contact.update({
      where: { id: draft.contactId },
      data: { crmStatus: "Outreach Sent" },
    });
    await prisma.outreachEvent.create({
      data: {
        draftId: draft.id,
        contactId: draft.contactId,
        type: "sent_simulated",
        actor: "LargeVCModel Outreach Agent",
        note: "Simulated send only. No email or LinkedIn API was called.",
      },
    });
    await prisma.auditEvent.create({
      data: {
        actor: "LargeVCModel Outreach Agent",
        actorType: "agent",
        action: "Simulated outreach send",
        affectedFounderId: draft.contactId,
        researchRunId: draft.researchRunId,
        dataSource: "simulation",
        details: "External send was simulated after explicit approval.",
      },
    });
    return ok({ draft });
  } catch (error) {
    return serverError(error);
  }
}
