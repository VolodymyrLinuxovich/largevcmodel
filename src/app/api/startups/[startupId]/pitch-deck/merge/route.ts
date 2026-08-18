import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { extractionMergeSchema, mergePitchDeckExtraction } from "@/lib/startups/pitch-deck";

export async function POST(request: Request, { params }: { params: Promise<{ startupId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { startupId } = await params;
    const body = extractionMergeSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid extraction merge request", body.error.flatten());
    const startup = await mergePitchDeckExtraction(prisma, user.id, startupId, body.data);
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Pitch deck extraction approved",
      outcome: "completed",
      dataSource: "User approved extraction",
      details: startup.name,
      metadata: { startupId, extractionId: body.data.extractionId },
    });
    return ok({ startup });
  } catch (error) {
    return serverError(error);
  }
}
