import { prisma } from "@/lib/prisma";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { executeResearchQuery } from "@/lib/domain/research-service";
import { queryRequestSchema } from "@/lib/domain/query";

export async function POST(request: Request) {
  try {
    const body = queryRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid query request", body.error.flatten());
    const result = await executeResearchQuery(prisma, body.data);
    return ok(result);
  } catch (error) {
    return serverError(error);
  }
}
