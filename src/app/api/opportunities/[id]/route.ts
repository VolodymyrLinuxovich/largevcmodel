import { requireCurrentUser } from "@/lib/auth/current-user";
import { notFound, ok, serverError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { getOpportunityDetail } from "@/lib/pipeline/queries";
import { updateOpportunitySchema } from "@/lib/pipeline/schemas";
import { updateOpportunity } from "@/lib/pipeline/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const opportunity = await getOpportunityDetail(prisma, user.id, id);
    if (!opportunity) return notFound("Opportunity not found");
    return ok({ opportunity });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const input = await parseJsonBody(request, updateOpportunitySchema, "Invalid opportunity update");
    return ok({ opportunity: await updateOpportunity(prisma, user, id, input) });
  } catch (error) {
    return serverError(error);
  }
}
