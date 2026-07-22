import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { scoreContact } from "@/lib/domain/research-service";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({ contactId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid scoring request", body.error.flatten());
    const score = await scoreContact(prisma, user.id, body.data.contactId);
    return ok({ score });
  } catch (error) {
    return serverError(error);
  }
}
