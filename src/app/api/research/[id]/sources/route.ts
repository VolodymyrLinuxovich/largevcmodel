import { requireCurrentUser } from "@/lib/auth/current-user";
import { notFound, ok, serverError } from "@/lib/api/respond";
import { sourceDomain } from "@/lib/domain/sources";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const run = await prisma.researchRun.findFirst({
      where: { id, userId: user.id },
      include: {
        claims: {
          include: {
            sources: { include: { source: true } },
          },
        },
      },
    });
    if (!run) return notFound("Research run not found");
    const sources = new Map<string, (typeof run.claims)[number]["sources"][number]["source"]>();
    for (const claim of run.claims) {
      for (const join of claim.sources) sources.set(join.sourceId, join.source);
    }
    const list = Array.from(sources.values()).map((source) => ({
      ...source,
      domain: sourceDomain(source.url),
    }));
    return ok({
      researchRunId: id,
      totalSources: list.length,
      uniqueDomains: new Set(list.map((source) => source.domain)).size,
      sources: list,
    });
  } catch (error) {
    return serverError(error);
  }
}
