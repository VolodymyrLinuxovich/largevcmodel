import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { stageChangeSchema } from "@/lib/pipeline/schemas";
import { changeOpportunityStage } from "@/lib/pipeline/service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const input = await parseJsonBody(request, stageChangeSchema, "Invalid stage change");
    return ok({ opportunity: await changeOpportunityStage(prisma, user, id, input) });
  } catch (error) {
    return serverError(error);
  }
}
