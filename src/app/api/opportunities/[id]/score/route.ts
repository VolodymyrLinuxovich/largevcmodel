import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { scoreOpportunity } from "@/lib/pipeline/service";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    return ok({ fitScore: await scoreOpportunity(prisma, user, id) }, 201);
  } catch (error) {
    return serverError(error);
  }
}
