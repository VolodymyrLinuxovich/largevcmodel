import { OpportunityStage } from "@prisma/client";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { listPipeline } from "@/lib/pipeline/queries";
import { createOpportunitySchema } from "@/lib/pipeline/schemas";
import { createOpportunity } from "@/lib/pipeline/service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const stage = new URL(request.url).searchParams.get("stage");
    const knownStage = Object.values(OpportunityStage).find((value) => value === stage);
    if (stage && !knownStage) return badRequest("Unknown opportunity stage");
    const opportunities = await listPipeline(prisma, user.id, { stage: knownStage });
    return ok({ opportunities });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = await parseJsonBody(request, createOpportunitySchema, "Invalid opportunity");
    return ok({ opportunity: await createOpportunity(prisma, user, input) }, 201);
  } catch (error) {
    return serverError(error);
  }
}
