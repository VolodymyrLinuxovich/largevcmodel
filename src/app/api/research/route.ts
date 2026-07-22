import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { researchRequestSchema, researchSubject } from "@/lib/domain/research-service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = researchRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid research request", body.error.flatten());
    const result = await researchSubject(prisma, user.id, body.data);
    return ok({ run: result });
  } catch (error) {
    return serverError(error);
  }
}
