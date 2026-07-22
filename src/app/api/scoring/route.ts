import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { calculateFitScore, DEFAULT_SCORING_WEIGHTS } from "@/lib/domain/scoring";

const requestSchema = z.object({
  contactId: z.string().min(1),
  weights: z
    .object({
      thesisMatch: z.number().min(0).max(100),
      stageFit: z.number().min(0).max(100),
      geographyFit: z.number().min(0).max(100),
      momentum: z.number().min(0).max(100),
      relationship: z.number().min(0).max(100),
      evidence: z.number().min(0).max(100),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid scoring request", body.error.flatten());
    const contact = await prisma.contact.findUnique({
      where: { id: body.data.contactId },
      include: {
        company: true,
        claims: {
          include: { sources: { include: { source: true } } },
        },
      },
    });
    if (!contact) return notFound("Founder contact not found");

    const sourceIds = new Set<string>();
    const publicSourceIds = new Set<string>();
    for (const claim of contact.claims) {
      for (const join of claim.sources) {
        sourceIds.add(join.sourceId);
        if (join.source.sourceType !== "internal_crm") publicSourceIds.add(join.sourceId);
      }
    }

    const score = calculateFitScore(
      {
        contactId: contact.id,
        fullName: contact.fullName,
        sector: contact.sector,
        stage: contact.stage,
        location: contact.location,
        relationshipStrength: contact.relationshipStrength,
        researchConfidence: contact.researchConfidence,
        company: contact.company,
        sourceCount: sourceIds.size,
        publicSourceCount: publicSourceIds.size,
        supportedClaimCount: contact.claims.length,
        citationSourceIds: Array.from(publicSourceIds),
      },
      body.data.weights ?? DEFAULT_SCORING_WEIGHTS,
    );

    return ok({ score });
  } catch (error) {
    return serverError(error);
  }
}
