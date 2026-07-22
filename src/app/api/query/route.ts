import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { executeResearchQuery, queryRequestSchema } from "@/lib/domain/research-service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = queryRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid query request", body.error.flatten());
    const result = await executeResearchQuery(prisma, user.id, body.data);
    return ok(result);
  } catch (error) {
    return serverError(error);
  }
}
