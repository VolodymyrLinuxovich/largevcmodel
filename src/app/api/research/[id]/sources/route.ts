import { prisma } from "@/lib/prisma";
import { notFound, ok, serverError } from "@/lib/api/respond";
import { buildResearchRunPayload } from "@/lib/domain/research-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await buildResearchRunPayload(prisma, id);
    if (!result) return notFound("Research run not found");
    return ok({
      researchRunId: id,
      totalSources: result.sources.length,
      sources: result.sources,
    });
  } catch (error) {
    return serverError(error);
  }
}
