import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { generateOutreachDraft } from "@/lib/domain/outreach";

const requestSchema = z.object({
  contactId: z.string().min(1),
  researchRunId: z.string().optional(),
  format: z.enum(["email", "linkedin"]).default("email"),
  tone: z.enum(["thoughtful", "direct", "warm"]).default("thoughtful"),
  version: z.enum(["short", "long"]).default("short"),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid outreach draft request", body.error.flatten());
    const contact = await prisma.contact.findUnique({
      where: { id: body.data.contactId },
      include: { company: true },
    });
    if (!contact) return notFound("Founder contact not found");

    const claims = await prisma.researchClaim.findMany({
      where: {
        contactId: contact.id,
        ...(body.data.researchRunId ? { researchRunId: body.data.researchRunId } : {}),
      },
      include: {
        sources: {
          include: { source: true },
        },
      },
    });
    const sourceMap = new Map<string, (typeof claims)[number]["sources"][number]["source"]>();
    for (const claim of claims) {
      for (const join of claim.sources) sourceMap.set(join.sourceId, join.source);
    }

    const generated = generateOutreachDraft(contact, Array.from(sourceMap.values()), body.data);
    const draft = await prisma.outreachDraft.create({
      data: {
        contactId: contact.id,
        researchRunId: body.data.researchRunId,
        format: generated.format,
        tone: generated.tone,
        version: generated.version,
        subject: generated.subject,
        body: generated.body,
        rationale: JSON.stringify({
          summary: generated.rationale,
          claims: generated.rationaleClaims,
        }),
        status: "Draft",
      },
    });

    await prisma.outreachEvent.create({
      data: {
        draftId: draft.id,
        contactId: contact.id,
        type: "draft_created",
        actor: "LargeVCModel Outreach Agent",
        note: "Generated an approval-required draft using only available evidence.",
      },
    });
    await prisma.auditEvent.create({
      data: {
        actor: "LargeVCModel Outreach Agent",
        actorType: "agent",
        action: "Generated outreach draft",
        affectedFounderId: contact.id,
        researchRunId: body.data.researchRunId,
        dataSource: "crm_and_research_sources",
        details: "Draft remains approval-required and excludes citation markers from the founder-facing message.",
      },
    });

    return ok({ draft: { ...draft, rationaleParsed: JSON.parse(draft.rationale) } });
  } catch (error) {
    return serverError(error);
  }
}
