import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { runPitchDeckExtraction } from "@/lib/startups/pitch-deck";

export async function POST(_: Request, { params }: { params: Promise<{ startupId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { startupId } = await params;
    const extraction = await runPitchDeckExtraction(prisma, user.id, startupId);
    await audit(prisma, {
      userId: user.id,
      actor: "Pitch deck parser",
      action: "Pitch deck extraction completed",
      outcome: extraction?.status ?? "unknown",
      dataSource: "User uploaded PDF",
      details: `${extraction?.fields.length ?? 0} structured fields extracted for review.`,
      metadata: { startupId, extractionId: extraction?.id },
    });
    return ok({ extraction });
  } catch (error) {
    return serverError(error);
  }
}
